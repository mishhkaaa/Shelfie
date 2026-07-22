import { create } from "zustand";
import type { Constraints, DriftResponse, ProfileVersion } from "../api/types";
import { api } from "../api/client";
import { constraintsEqual } from "../adapter/urlSchema";

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

  // Real hydration from the backend — no seed data. Called once on app mount.
  initialize: async () => {
    const { personas } = await api.listPersonas();
    const mapped: Persona[] = personas.map((p) => ({ id: p.id, label: p.name, emoji: "👤" }));
    const activePersona = mapped[0]?.id ?? "";
    const profiles = await fetchProfilesFor(activePersona);
    set({ personas: mapped, activePersona, profiles, activeProfile: null, isDirty: false });
  },

  setActivePersona: (id) => {
    set({ activePersona: id, activeProfile: null, isDirty: false, profiles: [] });
    fetchProfilesFor(id).then((profiles) => set({ profiles }));
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
}));
