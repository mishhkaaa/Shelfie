import { useState } from "react";
import { api } from "../api/client";
import { mergeConstraints } from "../adapter/mergeConstraints";
import { rankDiscoverFeed } from "../adapter/similarity";
import { useInpageStore } from "./store/useInpageStore";
import { applyWithRetry } from "./retryApply";
import type { Constraints } from "../api/types";

interface CombinedSearchProps {
  onRanked: (rankedProfileIds: string[] | null) => void;
}

export function CombinedSearch({ onRanked }: CombinedSearchProps) {
  const [sentence, setSentence] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ constraints: Partial<Constraints>; provenance: Record<string, string> } | null>(
    null
  );

  const discoverFeed = useInpageStore((state) => state.discoverFeed);

  const handleCompile = () => {
    if (!sentence.trim() || isLoading) return;
    setIsLoading(true);

    api
      .compileIntent(sentence)
      .then((result) => {
        setPending(result);
        // Fast, offline, immediate — stemmed word-overlap against the
        // structured patch and each profile's own fields. Shown right away
        // so the search never feels like it's just sitting there.
        const ranked = rankDiscoverFeed(discoverFeed, result.constraints, sentence);
        onRanked(ranked.map((item) => item.profileId));
      })
      .catch(() => {
        setPending({ constraints: {}, provenance: {} });
        onRanked(null);
      })
      .finally(() => setIsLoading(false));

    // Genuine semantic ranking via Groq (synonyms/related concepts, e.g.
    // "ethnic wear" -> sarees/kurtas) — slower, so it replaces the
    // client-side ordering above once it resolves rather than blocking on
    // it. A null/failed response is a no-op: whatever ranking is already
    // showing (client-side, or the previous search's result) stays put.
    api
      .discoverSearch(sentence)
      .then((result) => {
        if (result.rankedProfileIds !== null) onRanked(result.rankedProfileIds);
      })
      .catch(() => {
        // Groq ranking unavailable — the client-side rank from above already
        // handled this search, nothing more to do.
      });
  };

  const handleClear = () => {
    setPending(null);
    setApplyError(null);
    setSentence("");
    onRanked(null);
  };

  // Direct-apply doesn't require any matching stored profile — it merges
  // straight onto an empty base (no "live constraints" concept exists on
  // the Myntra page itself the way it does in the side panel) and
  // navigates the current page directly, since this bundle already runs
  // on the target tab (see navigateCurrentPageTo's doc comment).
  const handleApplyNow = () => {
    if (!pending) return;
    const merged = mergeConstraints(null, pending.constraints);
    if (!merged.category.articleType) {
      setApplyError(
        'Couldn\'t tell which Myntra page to go to — try mentioning a product type (e.g. "kurtas", "dresses").'
      );
      return;
    }
    applyWithRetry(merged);
    setApplyError(null);
  };

  const found = pending ? Object.entries(pending.provenance) : [];
  // The backend appends this marker to category.articleType's provenance
  // when Groq couldn't map the product type onto this app's small filter
  // lexicon and fell back to a free-text Myntra search instead — surfaced
  // distinctly so it's clear the request still worked, just via search
  // rather than a validated filter.
  const searchFallback = found.find(([field, value]) => field === "category.articleType" && value.includes("(Myntra search:"));

  return (
    <div className="bg-gray-50 border border-gray-200 rounded p-3">
      <h2 className="text-xs font-bold text-gray-800 mb-2">✨ Describe what you want</h2>
      <div className="flex gap-1">
        <input
          type="text"
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCompile()}
          placeholder="e.g. pure cotton kurtas under 1500 for school"
          className="flex-1 text-xs border rounded px-2 py-1.5 outline-none focus:border-myntra-brand"
        />
        <button
          onClick={handleCompile}
          disabled={isLoading || !sentence.trim()}
          className="text-xs bg-myntra-brand text-white px-3 rounded font-semibold disabled:opacity-50"
        >
          {isLoading ? "…" : "Search"}
        </button>
      </div>

      {applyError && (
        <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2 mt-2">{applyError}</p>
      )}

      {pending && (
        <div className="mt-2 bg-white border rounded p-2">
          {found.length === 0 ? (
            <p className="text-[11px] text-gray-500 italic">Nothing recognizable was found in that sentence.</p>
          ) : (
            <>
              {searchFallback && (
                <p className="text-[11px] text-gray-500 mb-1">
                  No saved filter matches "{searchFallback[1].split(" (Myntra search:")[0]}" — will search Myntra
                  directly for it instead.
                </p>
              )}
              <p className="text-[11px] text-gray-500 mb-1">Found in your sentence — profiles below are re-ranked:</p>
              <ul className="text-[11px] text-gray-700 space-y-0.5 mb-2">
                {found.map(([field, value]) => (
                  <li key={field}>
                    <span className="font-semibold">{field}</span> ← "{value.split(" (Myntra search:")[0]}"
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex gap-1">
            <button
              onClick={handleApplyNow}
              className="text-[11px] bg-myntra-brand text-white px-2 py-1 rounded font-semibold"
            >
              Just apply this to Myntra now
            </button>
            <button onClick={handleClear} className="text-[11px] text-gray-500 hover:text-gray-800 px-2">
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
