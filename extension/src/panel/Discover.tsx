import { useEffect, useState } from "react";
import { useShelfieStore } from "../store/useShelfieStore";
import type { DiscoverItem } from "../api/types";

function ForkControl({ item }: { item: DiscoverItem }) {
  const personas = useShelfieStore((state) => state.personas);
  const activePersona = useShelfieStore((state) => state.activePersona);
  const forkProfile = useShelfieStore((state) => state.forkProfile);

  const [isForking, setIsForking] = useState(false);
  const [personaId, setPersonaId] = useState(activePersona);
  const [name, setName] = useState(item.name);

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
      {personas.length > 1 && (
        // Reuses the same persona-selector pattern as the header selector —
        // only shown when there's an actual choice to make (master prompt
        // Part 2, Section 2.3).
        <select
          value={personaId}
          onChange={(e) => setPersonaId(e.target.value)}
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
        <button
          onClick={() => setIsForking(false)}
          className="text-[11px] text-gray-500 hover:text-gray-800 px-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function Discover() {
  const [isOpen, setIsOpen] = useState(false);
  const discoverFeed = useShelfieStore((state) => state.discoverFeed);
  const fetchDiscoverFeed = useShelfieStore((state) => state.fetchDiscoverFeed);
  const starProfile = useShelfieStore((state) => state.starProfile);

  useEffect(() => {
    if (isOpen) fetchDiscoverFeed();
  }, [isOpen, fetchDiscoverFeed]);

  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm mt-4">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex justify-between items-center p-3 text-left"
      >
        <h2 className="text-sm font-bold text-gray-800">🌐 Discover (public profiles)</h2>
        <span className="text-xs text-gray-400">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="p-3 pt-0 space-y-2">
          {discoverFeed.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No public profiles yet.</p>
          ) : (
            discoverFeed.map((item) => (
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
                <div className="mt-2">
                  <ForkControl item={item} />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
