import { useState } from "react";
import { useShelfieStore } from "../store/useShelfieStore";

export function ThreeWaySaveModal() {
  const driftResult = useShelfieStore((state) => state.driftResult);
  const confirmSave = useShelfieStore((state) => state.confirmSave);
  const clearDrift = useShelfieStore((state) => state.clearDrift);
  const activeProfile = useShelfieStore((state) => state.activeProfile);
  const saveProfile = useShelfieStore((state) => state.saveProfile);

  const [newName, setNewName] = useState("");
  const [versionLabel, setVersionLabel] = useState("");

  if (!driftResult) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full overflow-hidden">
        
        {/* Header */}
        <div className="bg-gray-100 p-4 border-b">
          <h3 className="font-bold text-gray-800 flex justify-between">
            Save Changes to {activeProfile?.name}
            <button onClick={clearDrift} className="text-gray-400 hover:text-gray-800">✕</button>
          </h3>
        </div>

        {/* AI Drift Analysis */}
        <div className="p-4 border-b">
          <p className="text-xs font-semibold text-myntra-brand mb-1">✨ AI Drift Analysis</p>
          <p className="text-sm text-gray-700 italic">
            "{driftResult.reason}"
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Recommendation: <strong className="uppercase">{driftResult.decision.replace("_", " ")}</strong>
          </p>
        </div>

        {/* Three Choices */}
        <div className="p-4 space-y-3">

          {/* Optional label, used by either "Create New Version" or "Update Current" below */}
          <input
            type="text"
            placeholder="Label this version (optional), e.g. Added occasion filter"
            value={versionLabel}
            onChange={(e) => setVersionLabel(e.target.value)}
            className="w-full text-xs border rounded px-2 py-1.5 outline-none focus:border-myntra-brand"
          />

          {/* Choice 1: New Version */}
          <button
            onClick={() => confirmSave("new_version", versionLabel || undefined)}
            className="w-full text-left p-3 border rounded hover:border-myntra-brand hover:bg-pink-50 transition"
          >
            <div className="font-bold text-sm text-gray-800">Create New Version</div>
            <div className="text-xs text-gray-500">Keep history. (currently v{activeProfile!.version})</div>
            {driftResult.decision === "new_version" && (
              <span className="inline-block mt-1 bg-myntra-brand text-white text-[10px] px-1.5 py-0.5 rounded">Recommended</span>
            )}
          </button>

          {/* Choice 2: Overwrite */}
          <button
            onClick={() => confirmSave("update", versionLabel || undefined)}
            className="w-full text-left p-3 border rounded hover:border-myntra-brand hover:bg-pink-50 transition"
          >
            <div className="font-bold text-sm text-gray-800">Update Current</div>
            <div className="text-xs text-gray-500">Overwrite v{activeProfile!.version} silently.</div>
          </button>

          {/* Choice 3: New Profile */}
          <div className="p-3 border rounded">
            <div className="font-bold text-sm text-gray-800 mb-1">Save as New Profile</div>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="New name..."
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="flex-1 text-sm border rounded px-2 py-1 outline-none focus:border-myntra-brand"
              />
              <button 
                onClick={() => {
                  if (newName) {
                    saveProfile(newName);
                    clearDrift();
                  }
                }}
                className="bg-gray-800 text-white text-xs px-3 rounded hover:bg-black transition"
              >
                Save
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
