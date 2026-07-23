import { create } from "zustand";
import type { Constraints, DiscoverItem, DriftResponse, ProfileVersion } from "../api/types";
import { api } from "../api/client";
import { constraintsEqual } from "../adapter/urlSchema";
import { fetchDiscoverFeedAction, forkProfileAction, starProfileAction } from "./discoverActions";

interface Persona {
  id: string;
  label: string;
  emoji: string;
}

interface ShelfieState {
  activePersona: string;
  personas: Persona[];

  activeProfile: ProfileVersion | null;
  liveConstraints: Constraints | null;
  isDirty: boolean;
  driftResult: DriftResponse | null;

  profiles: ProfileVersion[];

  // Collaboration + behavioural-suggestion state (Part 2). Fetched from the
  // backend on mount/open, same as everything else — no client-side source
  // of truth (master prompt Part 2, Section 0.3).
  discoverFeed: DiscoverItem[];
  behaviourTrackingEnabled: boolean;
  // Surfaces the reason behind any action below that no-ops for a legitimate
  // reason (no persona chosen to fork into, a failed request, etc.) — every
  // guard clause here sets this instead of silently returning, per Section 0.3.
  actionError: string | null;

  initialize: () => Promise<void>;
  setActivePersona: (id: string) => void;
  loadLiveConstraints: (c: Constraints) => void;
  activateProfile: (profile: ProfileVersion) => void;
  saveProfile: (name: string) => Promise<void>;

  // Day 2 Actions
  requestSave: () => Promise<void>;
  confirmSave: (mode: "new_version" | "update" | "new_profile", name?: string) => Promise<void>;
  rollback: (profileId: string, toVersion: number) => Promise<void>;
  clearDrift: () => void;
  addPersona: (label: string, emoji: string) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;

  // Part 2 actions — new actions, no existing signatures touched.
  toggleVisibility: (profileId: string, visibility: "private" | "public") => Promise<void>;
  refreshProfilesForPersona: (personaId: string) => Promise<void>;
  fetchDiscoverFeed: () => Promise<void>;
  starProfile: (profileId: string) => Promise<void>;
  forkProfile: (profileId: string, personaId: string, name: string) => Promise<void>;
  setBehaviourTracking: (enabled: boolean) => Promise<void>;
  clearActionError: () => void;
}

async function fetchProfilesFor(personaId: string): Promise<ProfileVersion[]> {
  if (!personaId) return [];
  const { profiles } = await api.listProfiles(personaId);
  return profiles;
}

export const useShelfieStore = create<ShelfieState>()((set, get) => ({
  activePersona: "",
  personas: [],

  activeProfile: null,
  liveConstraints: null,
  isDirty: false,
  driftResult: null,

  profiles: [],

  discoverFeed: [],
  behaviourTrackingEnabled: false,
  actionError: null,

  // Real hydration from the backend — no seed data. Called once on app mount.
  initialize: async () => {
    const [{ personas }, settings] = await Promise.all([api.listPersonas(), api.getAccountSettings()]);
    const mapped: Persona[] = personas.map((p) => ({ id: p.id, label: p.name, emoji: "👤" }));
    const activePersona = mapped[0]?.id ?? "";
    const profiles = await fetchProfilesFor(activePersona);
    set({
      personas: mapped,
      activePersona,
      profiles,
      activeProfile: null,
      isDirty: false,
      behaviourTrackingEnabled: settings.behaviourTrackingEnabled,
    });
  },

  setActivePersona: (id) => {
    set({ activePersona: id, activeProfile: null, isDirty: false, profiles: [] });
    fetchProfilesFor(id).then((profiles) => set({ profiles }));
  },

  // Re-fetches profiles for a given persona without disturbing activeProfile
  // /isDirty — used when something outside this store (a fork made from the
  // in-page Discover panel, a separate bundle/store entirely) changes what's
  // in the backend for a persona the side panel is currently looking at, or
  // may look at later. Only touches local state if it's still the active
  // persona by the time the fetch resolves, so a persona switch mid-flight
  // can't clobber the newly-selected persona's profiles with stale data.
  refreshProfilesForPersona: async (personaId) => {
    const profiles = await fetchProfilesFor(personaId);
    if (get().activePersona === personaId) set({ profiles });
  },

  addPersona: async (label) => {
    const created = await api.createPersona(label);
    set((state) => ({
      personas: [...state.personas, { id: created.id, label: created.name, emoji: "👤" }],
      activePersona: created.id,
      activeProfile: null,
      isDirty: false,
      profiles: [],
    }));
  },

  loadLiveConstraints: (c) =>
    set((state) => {
      const dirty = state.activeProfile != null && !constraintsEqual(c, state.activeProfile.constraints);
      return { liveConstraints: c, isDirty: dirty };
    }),

  activateProfile: (profile) =>
    set({
      activeProfile: profile,
      isDirty: false,
    }),

  saveProfile: async (name) => {
    const state = get();
    if (!state.liveConstraints || !state.activePersona) {
      console.error("Shelfie: saveProfile no-op — missing liveConstraints or activePersona", {
        hasLiveConstraints: !!state.liveConstraints,
        activePersona: state.activePersona,
      });
      return;
    }
    const created = await api.createProfile(name, state.activePersona, state.liveConstraints);
    set((s) => ({
      profiles: [...s.profiles, created],
      activeProfile: created,
      isDirty: false,
    }));
  },

  deleteProfile: async (id) => {
    await api.deleteProfile(id);
    set((state) => ({
      profiles: state.profiles.filter((p) => p.id !== id),
      activeProfile: state.activeProfile?.id === id ? null : state.activeProfile,
    }));
  },

  // --- DAY 2 ACTIONS ---
  requestSave: async () => {
    const state = get();
    if (!state.activeProfile || !state.liveConstraints) {
      console.error("Shelfie: requestSave no-op — missing activeProfile or liveConstraints", {
        hasActiveProfile: !!state.activeProfile,
        hasLiveConstraints: !!state.liveConstraints,
      });
      return;
    }
    const result = await api.drift(state.activeProfile.id, state.liveConstraints);
    set({ driftResult: result });
  },

  clearDrift: () => set({ driftResult: null }),

  confirmSave: async (mode, name) => {
    const state = get();
    if (!state.activeProfile || !state.liveConstraints) {
      console.error("Shelfie: confirmSave no-op — missing activeProfile or liveConstraints", {
        hasActiveProfile: !!state.activeProfile,
        hasLiveConstraints: !!state.liveConstraints,
      });
      return;
    }

    const result = await api.commit(state.activeProfile.id, mode, state.liveConstraints, name);

    if (result.isNewProfile) {
      const newProfile = await api.getProfile(result.profileId);
      set((s) => ({
        profiles: [...s.profiles, newProfile],
        activeProfile: newProfile,
        isDirty: false,
        driftResult: null,
      }));
      return;
    }

    // Re-fetch rather than hand-constructing the updated profile locally —
    // the backend response also carries versionLabel/history now, which we
    // don't have enough information to reconstruct client-side.
    const updatedProfile = await api.getProfile(result.profileId);
    set((s) => ({
      profiles: s.profiles.map((p) => (p.id === updatedProfile.id ? updatedProfile : p)),
      activeProfile: updatedProfile,
      isDirty: false,
      driftResult: null,
    }));
  },

  rollback: async (profileId, toVersion) => {
    const updated = await api.rollback(profileId, toVersion);
    set((state) => ({
      profiles: state.profiles.map((p) => (p.id === profileId ? updated : p)),
      activeProfile: state.activeProfile?.id === profileId ? updated : state.activeProfile,
      isDirty: false,
    }));
  },

  // --- PART 2: COLLABORATION + BEHAVIOUR ---
  toggleVisibility: async (profileId, visibility) => {
    try {
      const updated = await api.setVisibility(profileId, visibility);
      set((state) => ({
        profiles: state.profiles.map((p) => (p.id === profileId ? updated : p)),
        activeProfile: state.activeProfile?.id === profileId ? updated : state.activeProfile,
        actionError: null,
      }));
    } catch (err) {
      console.error("Shelfie: toggleVisibility failed", err);
      set({ actionError: "Couldn't update visibility — try again." });
    }
  },

  fetchDiscoverFeed: async () => {
    const result = await fetchDiscoverFeedAction();
    if ("error" in result) {
      set({ actionError: result.error });
      return;
    }
    set({ discoverFeed: result.profiles, actionError: null });
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
    set((state) => ({
      profiles: state.activePersona === personaId ? [...state.profiles, result.forked] : state.profiles,
      discoverFeed: result.feed,
      actionError: null,
    }));
  },

  setBehaviourTracking: async (enabled) => {
    try {
      const settings = await api.updateAccountSettings({ behaviourTrackingEnabled: enabled });
      set({ behaviourTrackingEnabled: settings.behaviourTrackingEnabled, actionError: null });
    } catch (err) {
      console.error("Shelfie: setBehaviourTracking failed", err);
      set({ actionError: "Couldn't update this setting — try again." });
    }
  },

  clearActionError: () => set({ actionError: null }),
}));
