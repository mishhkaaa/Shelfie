import { useShelfieStore } from "../store/useShelfieStore";

export function Timeline() {
  const activeProfile = useShelfieStore((state) => state.activeProfile);
  const rollback = useShelfieStore((state) => state.rollback);

  if (!activeProfile) return null;

  return (
    <div className="bg-white p-4 border border-gray-200 rounded shadow-sm mt-4">
      <h2 className="text-sm font-bold text-gray-800 mb-2">Version History (Timeline)</h2>
      <div className="relative border-l-2 border-gray-200 ml-2 space-y-4 py-2">
        
        {/* Current Version */}
        <div className="relative pl-4">
          <div className="absolute w-3 h-3 bg-myntra-brand rounded-full -left-[7px] top-1"></div>
          <p className="text-xs font-bold text-gray-800">v{activeProfile.version} (Current)</p>
          <p className="text-[10px] text-gray-500">Active right now</p>
        </div>

        {/* Previous Version(s) */}
        {activeProfile.version > 1 && (
          <div className="relative pl-4">
            <div className="absolute w-3 h-3 bg-gray-300 rounded-full -left-[7px] top-1"></div>
            <p className="text-xs font-bold text-gray-600">v{activeProfile.version - 1}</p>
            <p className="text-[10px] text-gray-500 mb-1">Previous state</p>
            <button 
              onClick={() => rollback(activeProfile.id, activeProfile.version - 1)}
              className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded"
            >
              ⟲ Revert to v{activeProfile.version - 1}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
