import { useEffect, useState } from "react";
import { useShelfieStore } from "../store/useShelfieStore";
import { api } from "../api/client";

export function BehaviourPanel() {
  const behaviourTrackingEnabled = useShelfieStore((state) => state.behaviourTrackingEnabled);
  const setBehaviourTracking = useShelfieStore((state) => state.setBehaviourTracking);
  const liveConstraints = useShelfieStore((state) => state.liveConstraints);
  const activePersona = useShelfieStore((state) => state.activePersona);
  const activeProfile = useShelfieStore((state) => state.activeProfile);

  const [nudgeVisible, setNudgeVisible] = useState(false);

  // Only observe while tracking is explicitly on — debounced for 2 full
  // seconds of no further change (deliberately longer than the 600ms used
  // for AI name suggestions: this is meant to catch a settled search, not
  // fire on every keystroke — master prompt Part 2, Section 3.3).
  useEffect(() => {
    if (!behaviourTrackingEnabled || !liveConstraints || !activePersona) {
      setNudgeVisible(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .observeBehaviour(activePersona, liveConstraints)
        .then(({ suggest }) => {
          if (!cancelled) setNudgeVisible(suggest);
        })
        .catch(() => {
          if (!cancelled) setNudgeVisible(false);
        });
    }, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [behaviourTrackingEnabled, liveConstraints, activePersona]);

  // The nudge only makes sense while there's an actual save flow on screen
  // to point at (SaveSheet renders whenever there's no clean active profile).
  useEffect(() => {
    if (activeProfile) setNudgeVisible(false);
  }, [activeProfile]);

  const scrollToSaveSheet = () => {
    document.getElementById("shelfie-save-sheet")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setNudgeVisible(false);
  };

  return (
    <div className="bg-white p-3 border border-gray-200 rounded shadow-sm mt-4">
      <label className="flex items-center justify-between cursor-pointer">
        <span className="text-xs font-semibold text-gray-700">
          Let Shelfie suggest profiles from my repeated searches
        </span>
        <input
          type="checkbox"
          checked={behaviourTrackingEnabled}
          onChange={(e) => setBehaviourTracking(e.target.checked)}
          className="accent-myntra-brand"
        />
      </label>

      {nudgeVisible && (
        <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2 flex items-center justify-between">
          <p className="text-[11px] text-amber-800">You've searched this a few times — save it as a profile?</p>
          <div className="flex gap-1 shrink-0 ml-2">
            <button
              onClick={scrollToSaveSheet}
              className="text-[11px] bg-myntra-brand text-white px-2 py-1 rounded font-semibold"
            >
              Save
            </button>
            <button
              onClick={() => setNudgeVisible(false)}
              className="text-[11px] text-gray-500 hover:text-gray-800 px-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
