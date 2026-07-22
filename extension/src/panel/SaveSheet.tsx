import { useEffect, useState } from "react";
import { useShelfieStore } from "../store/useShelfieStore";
import { api } from "../api/client";
import type { Constraints, CoverageResponse } from "../api/types";

function friendlyFieldName(field: string): string {
  return field.replace(".include", "").replace("category.", "");
}

function renderConstraintRows(c: Constraints): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];

  if (c.category?.articleType) {
    rows.push({
      label: "Category",
      value: c.category.gender ? `${c.category.articleType} (${c.category.gender})` : c.category.articleType,
    });
  }
  if (c.price && (c.price.min > 0 || c.price.max > 0)) {
    rows.push({ label: "Price", value: `₹${c.price.min} – ₹${c.price.max}` });
  }
  if (c.brand?.include?.length) rows.push({ label: "Brands", value: c.brand.include.join(", ") });
  if (c.brand?.exclude?.length) rows.push({ label: "Excluded brands", value: c.brand.exclude.join(", ") });
  if (c.fabric?.include?.length) rows.push({ label: "Fabric", value: c.fabric.include.join(", ") });
  if (c.sleeve?.include?.length) rows.push({ label: "Sleeve", value: c.sleeve.include.join(", ") });
  if (c.neck?.include?.length) rows.push({ label: "Neck", value: c.neck.include.join(", ") });
  if (c.size?.include?.length) rows.push({ label: "Size", value: c.size.include.join(", ") });
  if (c.color?.include?.length) rows.push({ label: "Color", value: c.color.include.join(", ") });
  if (c.color?.exclude?.length) rows.push({ label: "Excluded colors", value: c.color.exclude.join(", ") });
  if (c.rating?.min) rows.push({ label: "Min rating", value: `${c.rating.min}+` });
  if (c.occasion) rows.push({ label: "Occasion", value: c.occasion });
  if (c.other) {
    for (const [key, values] of Object.entries(c.other)) {
      if (values?.length) rows.push({ label: key, value: values.join(", ") });
    }
  }

  return rows;
}

export function SaveSheet() {
  const [name, setName] = useState("");
  const [suggestion, setSuggestion] = useState<{ name: string; description: string } | null>(null);

  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);

  const liveConstraints = useShelfieStore((state) => state.liveConstraints);
  const isDirty = useShelfieStore((state) => state.isDirty);
  const activeProfile = useShelfieStore((state) => state.activeProfile);
  const activePersona = useShelfieStore((state) => state.activePersona);

  const saveProfile = useShelfieStore((state) => state.saveProfile);

  // Debounced, fire-and-forget suggested-name lookup (master prompt Section
  // 8.1 / 9.5) — never blocks typing or the Save button. A null/failed
  // response just means no suggestion chip appears.
  useEffect(() => {
    if (!liveConstraints) {
      setSuggestion(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .suggestName(liveConstraints)
        .then(({ suggestedName, suggestedDescription }) => {
          if (cancelled) return;
          setSuggestion(suggestedName ? { name: suggestedName, description: suggestedDescription ?? "" } : null);
        })
        .catch(() => {
          if (!cancelled) setSuggestion(null);
        });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [liveConstraints]);

  // Coverage advisor (master prompt Part 2, Section 4.4) — purely advisory,
  // never blocks saving. Debounced independently of the name suggestion so
  // one slow request never delays the other.
  useEffect(() => {
    if (!liveConstraints) {
      setCoverage(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .checkCoverage(liveConstraints, activePersona || undefined)
        .then((result) => {
          if (!cancelled) setCoverage(result);
        })
        .catch(() => {
          if (!cancelled) setCoverage(null);
        });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [liveConstraints, activePersona]);

  // If there's already an active profile and it's NOT dirty, we don't need to show the save sheet
  if (activeProfile && !isDirty) return null;

  // Without a persona, saveProfile has nowhere to attach the new profile and
  // silently no-ops (no network request at all) — show this instead of a
  // save form that looks functional but does nothing.
  if (!activePersona) {
    return (
      <div className="bg-white p-4 border border-gray-200 rounded shadow-sm mt-4">
        <p className="text-xs text-gray-500 italic">
          Create or select a persona (use the + button at the top) before saving a profile.
        </p>
      </div>
    );
  }

  const handleSave = () => {
    saveProfile(name);
    setName("");
    setSuggestion(null);
  };

  const rows = liveConstraints ? renderConstraintRows(liveConstraints) : [];

  return (
    <div id="shelfie-save-sheet" className="bg-white p-4 border border-gray-200 rounded shadow-sm mt-4">
      <h2 className="text-sm font-bold text-gray-800 mb-2">Save current search</h2>

      <div className="mb-3">
        <label className="text-xs text-gray-600 block mb-1">Profile Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Summer Kurtas under ₹1500"
          className="w-full border border-gray-300 p-2 text-sm rounded focus:outline-none focus:border-myntra-brand"
        />
        {suggestion && !name && (
          <button
            type="button"
            onClick={() => setName(suggestion.name)}
            title={suggestion.description}
            className="mt-1 text-[11px] text-myntra-brand bg-pink-50 hover:bg-pink-100 px-2 py-1 rounded transition"
          >
            ✨ Suggested: {suggestion.name}
          </button>
        )}
      </div>

      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-1">This profile will save:</p>
        {rows.length ? (
          <ul className="text-xs text-gray-700 bg-gray-50 p-2 rounded space-y-0.5">
            {rows.map((row) => (
              <li key={row.label}>
                <span className="font-semibold">{row.label}:</span> {row.value}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-400 italic bg-gray-50 p-2 rounded">No filters detected yet.</p>
        )}
        {coverage && coverage.suggestions.length > 0 && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-1">
            Only {coverage.currentCount} products match — try relaxing{" "}
            <strong>{friendlyFieldName(coverage.suggestions[0].field)}</strong> (+{coverage.suggestions[0].gain} items).
            <span className="text-gray-500"> (synthetic catalog, for demo purposes)</span>
          </p>
        )}
      </div>

      <button
        onClick={handleSave}
        className="w-full bg-myntra-brand text-white font-bold py-2 rounded text-sm hover:bg-myntra-hover transition"
      >
        Save Profile
      </button>
    </div>
  );
}
