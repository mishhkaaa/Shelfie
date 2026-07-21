import { useState } from "react";
import { useShelfieStore } from "../store/useShelfieStore";

export function SaveSheet() {
  const [name, setName] = useState("");
  const liveConstraints = useShelfieStore((state) => state.liveConstraints);
  const isDirty = useShelfieStore((state) => state.isDirty);
  const activeProfile = useShelfieStore((state) => state.activeProfile);

  const saveProfile = useShelfieStore((state) => state.saveProfile);

  // If there's already an active profile and it's NOT dirty, we don't need to show the save sheet
  if (activeProfile && !isDirty) return null;

  const handleSave = () => {
    saveProfile(name);
    setName(""); // clear input
  };

  return (
    <div className="bg-white p-4 border border-gray-200 rounded shadow-sm mt-4">
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
      </div>

      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-1">This profile will save:</p>
        <ul className="text-xs text-gray-700 bg-gray-50 p-2 rounded">
          {liveConstraints?.brand.include.length ? <li>Brands: {liveConstraints.brand.include.join(", ")}</li> : null}
          {liveConstraints?.category.articleType ? <li>Category: {liveConstraints.category.articleType}</li> : null}
          {/* We will add more constraints here as we read them from the URL! */}
        </ul>
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
