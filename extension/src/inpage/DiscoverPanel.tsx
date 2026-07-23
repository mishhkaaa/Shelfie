import { useEffect, useMemo, useState } from "react";
import { useInpageStore } from "./store/useInpageStore";
import { ForkControl } from "./ForkControl";
import { CombinedSearch } from "./CombinedSearch";
import { applyWithRetry } from "./retryApply";
import { ShareButton } from "../components/ShareButton";

export function DiscoverPanel() {
  const discoverFeed = useInpageStore((state) => state.discoverFeed);
  const isLoading = useInpageStore((state) => state.isLoading);
  const actionError = useInpageStore((state) => state.actionError);
  const clearActionError = useInpageStore((state) => state.clearActionError);
  const starProfile = useInpageStore((state) => state.starProfile);
  const initialize = useInpageStore((state) => state.initialize);

  const [rankedIds, setRankedIds] = useState<string[] | null>(null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const visibleFeed = useMemo(() => {
    if (!rankedIds) return discoverFeed;
    const byId = new Map(discoverFeed.map((item) => [item.profileId, item]));
    return rankedIds.map((id) => byId.get(id)).filter((item): item is (typeof discoverFeed)[number] => !!item);
  }, [discoverFeed, rankedIds]);

  return (
    <div className="p-4">
      <CombinedSearch onRanked={setRankedIds} />

      {actionError && (
        <div className="mb-3 p-2 text-xs font-semibold text-red-800 bg-red-100 rounded flex justify-between items-center">
          <span>{actionError}</span>
          <button onClick={clearActionError} className="text-red-400 hover:text-red-800 ml-2">
            ✕
          </button>
        </div>
      )}

      <h2 className="text-xs font-bold text-gray-800 mb-2 mt-4">
        Public profiles{rankedIds ? " — ranked by your search" : ""}
      </h2>

      {isLoading ? (
        <p className="text-xs text-gray-500 italic">Loading…</p>
      ) : discoverFeed.length === 0 ? (
        <p className="text-xs text-gray-500 italic">No public profiles yet.</p>
      ) : visibleFeed.length === 0 ? (
        <p className="text-xs text-gray-500 italic">No profiles matched that search.</p>
      ) : (
        <div className="space-y-2">
          {visibleFeed.map((item) => (
            <div key={item.profileId} className="border border-gray-200 rounded p-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{item.name}</p>
                  <p className="text-[10px] text-gray-400">by {item.ownerLabel}</p>
                </div>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => starProfile(item.profileId)}
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      item.starredByMe ? "text-myntra-brand" : "text-gray-400 hover:text-myntra-brand"
                    }`}
                    title={item.starredByMe ? "Unstar" : "Star"}
                  >
                    {item.starredByMe ? "★" : "☆"} {item.starsCount}
                  </button>
                  <span className="text-[10px] text-gray-400">⑂ {item.forksCount}</span>
                </div>
              </div>
              <div className="mt-2 flex gap-1 items-start flex-wrap">
                <button
                  onClick={() => applyWithRetry(item.constraints)}
                  className="text-[11px] bg-myntra-brand text-white px-2 py-1 rounded font-semibold"
                >
                  Apply directly
                </button>
                <ForkControl item={item} />
                <ShareButton profileId={item.profileId} name={item.name} constraints={item.constraints} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
