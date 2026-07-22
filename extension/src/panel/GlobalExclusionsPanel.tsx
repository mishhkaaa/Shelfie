import { useEffect, useState } from "react";
import { useShelfieStore } from "../store/useShelfieStore";
import { api } from "../api/client";
import type { GlobalExclusions } from "../api/types";

const EMPTY: GlobalExclusions = { brand: [], fabric: [], color: [] };

function parseList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Persistent "never show" rules for the active persona (master prompt Part
// 2, Section 5.2) — lowest priority of everything in this build, kept
// deliberately minimal: three comma-separated text fields, applied wherever
// constraints are evaluated against the catalog (coverage/diff).
export function GlobalExclusionsPanel() {
  const activePersona = useShelfieStore((state) => state.activePersona);

  const [exclusions, setExclusionsState] = useState<GlobalExclusions>(EMPTY);
  const [isOpen, setIsOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!activePersona) {
      setExclusionsState(EMPTY);
      return;
    }
    api
      .getExclusions(activePersona)
      .then(({ globalExclusions }) => setExclusionsState(globalExclusions))
      .catch(() => setExclusionsState(EMPTY));
  }, [activePersona]);

  if (!activePersona) return null;

  const handleSave = () => {
    api
      .setExclusions(activePersona, exclusions)
      .then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      })
      .catch(() => setSaved(false));
  };

  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm mt-4">
      <button onClick={() => setIsOpen((v) => !v)} className="w-full flex justify-between items-center p-3 text-left">
        <h2 className="text-sm font-bold text-gray-800">🚫 Never show me (this persona)</h2>
        <span className="text-xs text-gray-400">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="p-3 pt-0 space-y-2">
          <div>
            <label className="text-[11px] text-gray-600 block mb-0.5">Brands, comma-separated</label>
            <input
              type="text"
              value={exclusions.brand.join(", ")}
              onChange={(e) => setExclusionsState((s) => ({ ...s, brand: parseList(e.target.value) }))}
              className="w-full text-xs border rounded px-2 py-1"
              placeholder="e.g. StyleCast"
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-600 block mb-0.5">Fabrics, comma-separated</label>
            <input
              type="text"
              value={exclusions.fabric.join(", ")}
              onChange={(e) => setExclusionsState((s) => ({ ...s, fabric: parseList(e.target.value) }))}
              className="w-full text-xs border rounded px-2 py-1"
              placeholder="e.g. Polyester"
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-600 block mb-0.5">Colors, comma-separated</label>
            <input
              type="text"
              value={exclusions.color.join(", ")}
              onChange={(e) => setExclusionsState((s) => ({ ...s, color: parseList(e.target.value) }))}
              className="w-full text-xs border rounded px-2 py-1"
              placeholder="e.g. Yellow_ffff00"
            />
          </div>
          <button
            onClick={handleSave}
            className="text-[11px] bg-myntra-brand text-white px-2 py-1 rounded font-semibold"
          >
            {saved ? "Saved ✓" : "Save"}
          </button>
          <p className="text-[10px] text-gray-400">
            Applied wherever the synthetic catalog is checked (coverage suggestions, diff preview).
          </p>
        </div>
      )}
    </div>
  );
}
