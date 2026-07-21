import { useShelfieStore } from "../store/useShelfieStore";

export function StatusBar() {
  const isDirty = useShelfieStore((state) => state.isDirty);
  const activeProfile = useShelfieStore((state) => state.activeProfile);
  const requestSave = useShelfieStore((state) => state.requestSave);

  let statusText = "";
  let statusColor = "";
  let handleClick = () => {};

  if (!activeProfile) {
    statusText = "● Unsaved search — Save as Shopping Profile";
    statusColor = "text-gray-500 bg-gray-100";
  } else if (isDirty) {
    statusText = `✎ ${activeProfile.name} · v${activeProfile.version} — Unsaved changes (Click to Save)`;
    statusColor = "text-amber-800 bg-amber-100 hover:bg-amber-200 transition";
    handleClick = requestSave;
  } else {
    statusText = `✓ ${activeProfile.name} · v${activeProfile.version}`;
    statusColor = "text-green-800 bg-green-100";
  }

  return (
    <div 
      onClick={handleClick}
      className={`w-full p-2 text-xs font-semibold rounded mb-4 cursor-pointer ${statusColor}`}
    >
      {statusText}
    </div>
  );
}
