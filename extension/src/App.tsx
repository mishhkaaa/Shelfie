import { useEffect, useState } from "react";
import { useShelfieStore } from "./store/useShelfieStore";
import { StatusBar } from "./panel/StatusBar";
import { ProfileList } from "./panel/ProfileList";
import { SaveSheet } from "./panel/SaveSheet";
import { Timeline } from "./panel/Timeline";
import { ThreeWaySaveModal } from "./panel/ThreeWaySaveModal";
import { Discover } from "./panel/Discover";
import { BehaviourPanel } from "./panel/BehaviourPanel";
import { parseUrlToConstraints } from "./adapter/urlSchema";

export default function App() {
  const activePersona = useShelfieStore((state) => state.activePersona);
  const personas = useShelfieStore((state) => state.personas);
  const setActivePersona = useShelfieStore((state) => state.setActivePersona);
  const addPersona = useShelfieStore((state) => state.addPersona);
  const loadLiveConstraints = useShelfieStore((state) => state.loadLiveConstraints);
  const initialize = useShelfieStore((state) => state.initialize);
  const actionError = useShelfieStore((state) => state.actionError);
  const clearActionError = useShelfieStore((state) => state.clearActionError);

  const [isAddingPersona, setIsAddingPersona] = useState(false);
  const [newPersonaName, setNewPersonaName] = useState("");

  // Real hydration from the backend (personas + profiles) on every panel
  // open — there is no local seed data or persisted mock state anymore.
  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    const handleUrl = (url: string) => {
      if (url.includes("myntra.com")) {
        console.log("Side Panel saw URL:", url);
        const newConstraints = parseUrlToConstraints(url);
        loadLiveConstraints(newConstraints);
      }
    };

    // 1. Listen to Content Script (for pushState SPA changes)
    const messageListener = (message: any) => {
      if (message.type === "MYNTRA_URL_CHANGED") handleUrl(message.url);
    };
    chrome.runtime.onMessage.addListener(messageListener);

    // 2. Listen to Tab Updates (for full page reloads or navigation)
    const tabListener = (_tabId: any, changeInfo: any, tab: any) => {
      if (tab.active && changeInfo.url) handleUrl(changeInfo.url);
    };
    chrome.tabs.onUpdated.addListener(tabListener);

    // 3. Catch the current URL immediately when Side Panel opens
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) handleUrl(tabs[0].url);
    });

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.tabs.onUpdated.removeListener(tabListener);
    };
  }, [loadLiveConstraints]);

  return (
    <div className="p-4 bg-gray-50 h-screen font-sans w-full relative overflow-y-auto">
      <div className="flex justify-between items-center mb-4 pb-2 border-b">
        <div className="flex items-center">
          <img src="/logo.png" alt="Shelfie Logo" className="h-8" />
        </div>
        
        <div className="flex gap-2 items-center">
          {isAddingPersona ? (
            <div className="flex gap-1">
              <input 
                type="text"
                autoFocus
                placeholder="Name..."
                className="text-xs border rounded px-1 py-1 w-20"
                value={newPersonaName}
                onChange={e => setNewPersonaName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newPersonaName) {
                    addPersona(newPersonaName, "👤");
                    setIsAddingPersona(false);
                    setNewPersonaName("");
                  }
                }}
              />
              <button 
                onClick={() => setIsAddingPersona(false)}
                className="text-xs text-gray-500 hover:text-gray-800"
              >✕</button>
            </div>
          ) : (
            <>
              <select 
                value={activePersona}
                onChange={(e) => setActivePersona(e.target.value)}
                className="text-xs font-medium text-gray-700 bg-white border border-gray-300 px-2 py-1 rounded shadow-sm focus:outline-none focus:border-myntra-brand"
              >
                {personas.map(p => (
                  <option key={p.id} value={p.id}>{p.emoji} {p.label}</option>
                ))}
              </select>
              <button 
                onClick={() => setIsAddingPersona(true)}
                className="text-xs font-bold text-myntra-brand bg-pink-50 px-2 py-1 rounded hover:bg-pink-100 transition"
              >
                +
              </button>
            </>
          )}
        </div>
      </div>
      
      {actionError && (
        <div className="mb-4 p-2 text-xs font-semibold text-red-800 bg-red-100 rounded flex justify-between items-center">
          <span>{actionError}</span>
          <button onClick={clearActionError} className="text-red-400 hover:text-red-800 ml-2">✕</button>
        </div>
      )}

      <StatusBar />
      <ProfileList />
      <SaveSheet />
      <Timeline />
      <BehaviourPanel />
      <Discover />

      <ThreeWaySaveModal />
    </div>
  );
}
