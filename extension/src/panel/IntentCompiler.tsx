import { useState } from "react";
import { useShelfieStore } from "../store/useShelfieStore";
import { api } from "../api/client";
import { buildUrlFromConstraints } from "../adapter/urlSchema";
import { navigateActiveTabTo } from "../adapter/navigate";
import type { Constraints } from "../api/types";

const EMPTY_CONSTRAINTS: Constraints = {
  category: { articleType: "" },
  price: { min: 0, max: 0 },
  brand: { include: [], exclude: [] },
  fabric: { include: [] },
  size: { include: [] },
  color: { include: [], exclude: [] },
};

function mergeUnique(existing: string[] | undefined, incoming: string[] | undefined): string[] {
  return Array.from(new Set([...(existing ?? []), ...(incoming ?? [])]));
}

// Deterministic merge of a validated NL-compiler patch onto the current live
// constraints — the backend already did the propose-then-validate step
// (master prompt Part 2, Section 5.1); this just folds the result in the
// same additive way the rest of the app treats include-lists.
function mergeConstraints(base: Constraints | null, patch: Partial<Constraints>): Constraints {
  const merged: Constraints = base ? JSON.parse(JSON.stringify(base)) : JSON.parse(JSON.stringify(EMPTY_CONSTRAINTS));

  if (patch.category) merged.category = { ...merged.category, ...patch.category };
  if (patch.price) merged.price = { ...merged.price, ...patch.price };
  if (patch.brand?.include) merged.brand = { ...merged.brand, include: mergeUnique(merged.brand.include, patch.brand.include) };
  if (patch.fabric?.include) merged.fabric = { include: mergeUnique(merged.fabric.include, patch.fabric.include) };
  if (patch.color?.include) merged.color = { ...merged.color, include: mergeUnique(merged.color.include, patch.color.include) };
  if (patch.sleeve?.include) merged.sleeve = { include: mergeUnique(merged.sleeve?.include, patch.sleeve.include) };
  if (patch.neck?.include) merged.neck = { include: mergeUnique(merged.neck?.include, patch.neck.include) };
  if (patch.size?.include) merged.size = { include: mergeUnique(merged.size.include, patch.size.include) };
  if (patch.occasion) merged.occasion = patch.occasion;

  return merged;
}

export function IntentCompiler() {
  const [sentence, setSentence] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ constraints: Partial<Constraints>; provenance: Record<string, string> } | null>(
    null
  );

  const liveConstraints = useShelfieStore((state) => state.liveConstraints);

  const handleCompile = () => {
    if (!sentence.trim() || isLoading) return;
    setIsLoading(true);
    api
      .compileIntent(sentence)
      .then(setPending)
      .catch(() => setPending({ constraints: {}, provenance: {} }))
      .finally(() => setIsLoading(false));
  };

  // Apply-to-search must drive the REAL Myntra tab, not just this panel's
  // internal state — the same navigation mechanism activateProfile already
  // uses (build the URL, send NAVIGATE_TO, hard-navigate fallback). We
  // deliberately do NOT call loadLiveConstraints with the merged object
  // directly: liveConstraints only ever gets updated by re-parsing the real
  // navigated URL once the content script reports it, exactly like every
  // other filter change. That also means any field the URL builder can't
  // serialize (currently: price) simply won't survive into the real
  // liveConstraints afterward, instead of silently pretending it was applied.
  const handleApply = () => {
    if (!pending) return;
    const merged = mergeConstraints(liveConstraints, pending.constraints);
    if (!merged.category.articleType) {
      setApplyError(
        'Couldn\'t tell which Myntra page to go to — try mentioning a product type (e.g. "kurtas", "dresses").'
      );
      return;
    }
    navigateActiveTabTo(buildUrlFromConstraints(merged));
    setApplyError(null);
    setPending(null);
    setSentence("");
  };

  const found = pending ? Object.entries(pending.provenance) : [];

  return (
    <div className="bg-white p-3 border border-gray-200 rounded shadow-sm mt-4">
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
          {isLoading ? "…" : "Compile"}
        </button>
      </div>

      {applyError && (
        <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2 mt-2">{applyError}</p>
      )}

      {pending && (
        <div className="mt-2 bg-gray-50 border rounded p-2">
          {found.length === 0 ? (
            <p className="text-[11px] text-gray-500 italic">Nothing recognizable was found in that sentence.</p>
          ) : (
            <>
              <p className="text-[11px] text-gray-500 mb-1">Found in your sentence (only validated matches shown):</p>
              <ul className="text-[11px] text-gray-700 space-y-0.5 mb-2">
                {found.map(([field, value]) => (
                  <li key={field}>
                    <span className="font-semibold">{field}</span> ← "{value}"
                    {field.startsWith("price.") && (
                      <span className="text-gray-400"> (not yet applied to the live page)</span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex gap-1">
                <button
                  onClick={handleApply}
                  className="text-[11px] bg-myntra-brand text-white px-2 py-1 rounded font-semibold"
                >
                  Apply to search
                </button>
                <button
                  onClick={() => setPending(null)}
                  className="text-[11px] text-gray-500 hover:text-gray-800 px-2"
                >
                  Discard
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
