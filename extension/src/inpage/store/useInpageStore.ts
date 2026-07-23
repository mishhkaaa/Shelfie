import { create } from "zustand";
import { api } from "../../api/client";
import type { DiscoverItem } from "../../api/types";
import { fetchDiscoverFeedAction, forkProfileAction, starProfileAction } from "../../store/discoverActions";

interface Persona {
  id: string;
  label: string;
  emoji: string;
}

interface InpageState {
  discoverFeed: DiscoverItem[];
  personas: Persona[];
  activePersona: string;
  isLoading: boolean;
  actionError: string | null;

  initialize: () => Promise<void>;
  starProfile: (profileId: string) => Promise<void>;
  forkProfile: (profileId: string, personaId: string, name: string) => Promise<void>;
  clearActionError: () => void;
}

// A separate zustand store instance from the side panel's useShelfieStore —
// this bundle is injected as its own content script with its own module
// graph, so runtime state can never cross the boundary even though both
// may be alive in the same tab. Re-fetches everything itself on mount,
// same as the side panel does.
export const useInpageStore = create<InpageState>()((set) => ({
  discoverFeed: [],
  personas: [],
  activePersona: "",
  isLoading: false,
  actionError: null,

  initialize: async () => {
    set({ isLoading: true });
    try {
      const [feedResult, personasResult] = await Promise.all([fetchDiscoverFeedAction(), api.listPersonas()]);
      const mapped: Persona[] = personasResult.personas.map((p) => ({ id: p.id, label: p.name, emoji: "👤" }));
      set({
        discoverFeed: "error" in feedResult ? [] : feedResult.profiles,
        actionError: "error" in feedResult ? feedResult.error : null,
        personas: mapped,
        activePersona: mapped[0]?.id ?? "",
        isLoading: false,
      });
    } catch (err) {
      // A hard failure here (e.g. a CORS rejection, or the backend being
      // down) must still clear isLoading — otherwise the panel is stuck on
      // "Loading..." forever with no way for the user to tell what
      // happened, instead of surfacing an actionable error.
      console.error("Shelfie: inpage initialize failed", err);
      set({ isLoading: false, actionError: "Couldn't reach the Shelfie backend — is it running?" });
    }
  },

  starProfile: async (profileId) => {
    const result = await starProfileAction(profileId);
    if ("error" in result) {
      set({ actionError: result.error });
      return;
    }
    set((state) => ({
      discoverFeed: state.discoverFeed.map((item) =>
        item.profileId === profileId
          ? { ...item, starredByMe: result.starred, starsCount: result.starsCount }
          : item
      ),
      actionError: null,
    }));
  },

  forkProfile: async (profileId, personaId, name) => {
    const result = await forkProfileAction(profileId, personaId, name);
    if ("error" in result) {
      set({ actionError: result.error });
      return;
    }
    set({ discoverFeed: result.feed, actionError: null });

    // The side panel (useShelfieStore) is a completely separate store
    // instance in a separate bundle/execution context — it has no way to
    // know a fork just happened here unless told. Without this, the new
    // profile is genuinely saved (confirmed against the backend directly)
    // but invisible in the side panel until you switch personas away and
    // back, which forces it to re-fetch. Broadcast so it can refresh
    // immediately instead, whether or not the side panel is even open.
    chrome.runtime.sendMessage({ type: "SHELFIE_PROFILE_FORKED", personaId }, () => {
      if (chrome.runtime.lastError) {
        // Ignore: side panel isn't open right now — nothing to notify.
      }
    });
  },

  clearActionError: () => set({ actionError: null }),
}));
