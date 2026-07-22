import { useShelfieStore } from "../store/useShelfieStore";

export function Timeline() {
  const activeProfile = useShelfieStore((state) => state.activeProfile);
  const rollback = useShelfieStore((state) => state.rollback);

  if (!activeProfile) return null;

  // Real event history from the backend (master prompt Section 5 — event
  // sourcing), not the old "current version and version-1" approximation.
  const history = activeProfile.history ?? [];
  const sortedDesc = [...history].sort((a, b) => b.version - a.version);

  return (
    <div className="bg-white p-4 border border-gray-200 rounded shadow-sm mt-4">
      <h2 className="text-sm font-bold text-gray-800 mb-2">Version History (Timeline)</h2>
      <div className="relative border-l-2 border-gray-200 ml-2 space-y-4 py-2">
        {sortedDesc.length === 0 ? (
          <div className="relative pl-4">
            <div className="absolute w-3 h-3 bg-myntra-brand rounded-full -left-[7px] top-1"></div>
            <p className="text-xs font-bold text-gray-800">v{activeProfile.version} (Current)</p>
            <p className="text-[10px] text-gray-500">Active right now</p>
          </div>
        ) : (
          sortedDesc.map((entry) => {
            const isCurrent = entry.version === activeProfile.version;
            return (
              <div key={entry.version} className="relative pl-4">
                <div
                  className={`absolute w-3 h-3 rounded-full -left-[7px] top-1 ${
                    isCurrent ? "bg-myntra-brand" : "bg-gray-300"
                  }`}
                ></div>
                <p className={`text-xs font-bold ${isCurrent ? "text-gray-800" : "text-gray-600"}`}>
                  v{entry.version}
                  {entry.label ? ` — ${entry.label}` : ""}
                  {isCurrent ? " (Current)" : ""}
                </p>
                <p className="text-[10px] text-gray-500 mb-1">
                  {isCurrent ? "Active right now" : "Previous state"}
                </p>
                {!isCurrent && (
                  <button
                    onClick={() => rollback(activeProfile.id, entry.version)}
                    className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded"
                  >
                    ⟲ Revert to v{entry.version}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
