import { useEffect, useState } from "react";
import { useInpageStore } from "./store/useInpageStore";
import type { DiscoverItem } from "../api/types";

export function ForkControl({ item }: { item: DiscoverItem }) {
  const personas = useInpageStore((state) => state.personas);
  const activePersona = useInpageStore((state) => state.activePersona);
  const forkProfile = useInpageStore((state) => state.forkProfile);
  const actionError = useInpageStore((state) => state.actionError);

  const [isForking, setIsForking] = useState(false);
  const [personaId, setPersonaId] = useState(activePersona);
  const [name, setName] = useState(item.name);

  // useState(activePersona) only captures activePersona's value at this
  // component's first mount — if personas/activePersona finish loading from
  // the backend even one tick after ForkControl first renders (the two are
  // fetched in parallel, so ordering isn't guaranteed), personaId gets
  // stuck at "" forever and every fork silently no-ops. Keep it in sync
  // until the user actually picks something themselves.
  const [hasUserPicked, setHasUserPicked] = useState(false);
  useEffect(() => {
    if (!hasUserPicked) setPersonaId(activePersona);
  }, [activePersona, hasUserPicked]);

  if (!isForking) {
    return (
      <button
        onClick={() => setIsForking(true)}
        className="text-[11px] bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded font-semibold"
      >
        ⑂ Fork
      </button>
    );
  }

  const handleConfirm = () => {
    forkProfile(item.profileId, personaId, name);
    setIsForking(false);
  };

  return (
    <div className="flex flex-col gap-1 bg-gray-50 p-2 rounded border">
      {isForking && actionError && <p className="text-[11px] text-red-700">{actionError}</p>}
      {personas.length > 1 && (
        <select
          value={personaId}
          onChange={(e) => {
            setPersonaId(e.target.value);
            setHasUserPicked(true);
          }}
          className="text-[11px] border rounded px-1 py-1"
        >
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.emoji} {p.label}
            </option>
          ))}
        </select>
      )}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="text-[11px] border rounded px-1 py-1"
        placeholder="Name for your fork"
      />
      <div className="flex gap-1">
        <button
          onClick={handleConfirm}
          className="flex-1 text-[11px] bg-myntra-brand text-white px-2 py-1 rounded font-semibold"
        >
          Fork it
        </button>
        <button onClick={() => setIsForking(false)} className="text-[11px] text-gray-500 hover:text-gray-800 px-2">
          Cancel
        </button>
      </div>
    </div>
  );
}
