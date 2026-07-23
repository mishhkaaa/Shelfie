import { useShelfieStore } from "../store/useShelfieStore";
import { buildUrlFromConstraints } from "../adapter/urlSchema";
import { navigateActiveTabTo } from "../adapter/navigate";
import { ShareButton } from "../components/ShareButton";
import type { ProfileVersion } from "../api/types";

export function ProfileList() {
  const profiles = useShelfieStore((state) => state.profiles);
  const activePersona = useShelfieStore((state) => state.activePersona);
  const activateProfile = useShelfieStore((state) => state.activateProfile);
  const deleteProfile = useShelfieStore((state) => state.deleteProfile);
  const toggleVisibility = useShelfieStore((state) => state.toggleVisibility);

  // Filter profiles by the currently selected persona
  const personaProfiles = profiles.filter(p => p.personaId === activePersona || !p.personaId);

  const handleActivate = (p: ProfileVersion) => {
    activateProfile(p);
    navigateActiveTabTo(buildUrlFromConstraints(p.constraints));
  };

  return (
    <div className="mb-4">
      <h2 className="text-sm font-bold text-gray-800 mb-2">Saved Profiles</h2>
      {personaProfiles.length === 0 ? (
        <p className="text-xs text-gray-500 italic">No profiles saved for this persona yet.</p>
      ) : (
        <div className="space-y-2">
          {personaProfiles.map(p => (
            <div
              key={p.id}
              className="group bg-white border border-gray-200 rounded cursor-pointer hover:border-myntra-brand transition shadow-sm p-3"
              onClick={() => handleActivate(p)}
            >
              <div className="flex justify-between items-center">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-gray-700">{p.name}</span>
                  {p.forkedFromOwnerLabel && (
                    <span className="text-[10px] text-gray-400">Forked from {p.forkedFromOwnerLabel}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">v{p.version}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleVisibility(p.id, p.visibility === "public" ? "private" : "public");
                    }}
                    className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      p.visibility === "public"
                        ? "bg-green-100 text-green-800 hover:bg-green-200"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                    title="Click to toggle public/private"
                  >
                    {p.visibility === "public" ? "Public" : "Private"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // prevent clicking the card
                      deleteProfile(p.id);
                    }}
                    className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                    title="Delete Profile"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {p.visibility === "public" && (
                <div className="mt-2">
                  <ShareButton profileId={p.id} name={p.name} constraints={p.constraints} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
