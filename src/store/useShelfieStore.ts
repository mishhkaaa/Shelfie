import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Constraints, ProfileVersion } from "../api/types";
import { constraintsEqual } from "../adapter/urlSchema";

interface ShelfieState {
  currentUser: string;
  activePersona: string;
  personas: { id: string; label: string; emoji: string }[];
  
  activeProfile: ProfileVersion | null;
  liveConstraints: Constraints | null;
  isDirty: boolean;
  driftResult: any | null; // using any for MVP simplicity until we pull the exact type

  profiles: ProfileVersion[];

  setActivePersona: (id: string) => void;
  loadLiveConstraints: (c: Constraints) => void;
  activateProfile: (profile: ProfileVersion) => void;
  saveProfile: (name: string) => void;
  
  // Day 2 Actions
  requestSave: () => void;
  confirmSave: (mode: "new_version" | "update" | "new_profile", name?: string) => void;
  rollback: (profileId: string, toVersion: number) => void;
  clearDrift: () => void;
  addPersona: (label: string, emoji: string) => void;
  deleteProfile: (id: string) => void;
}

export const useShelfieStore = create<ShelfieState>()(
  persist(
    (set) => ({
      currentUser: "david",
      activePersona: "amma",
      personas: [
        { id: "amma", label: "Amma", emoji: "👩‍🦳" },
        { id: "david", label: "David", emoji: "👦" },
      ],
      
      activeProfile: null,
      liveConstraints: null,
      isDirty: false,
      driftResult: null,
      
      // Pre-load some dummy data so it feels alive immediately!
      profiles: [
        {
          id: "prof_1",
          name: "Bikini Tops",
          version: 1,
          personaId: "amma",
          constraints: {
            category: { articleType: "swimwear" },
            price: { min: 0, max: 0 },
            brand: { include: [], exclude: [] },
            fabric: { include: [] },
            sleeve: { include: [] },
            size: { include: [] },
            color: { include: [], exclude: [] }
          }
        },
        {
          id: "prof_2",
          name: "Hot Wheels Cars",
          version: 1,
          personaId: "david",
          constraints: {
            category: { articleType: "toys" },
            price: { min: 0, max: 0 },
            brand: { include: ["Hot Wheels"], exclude: [] },
            fabric: { include: [] },
            sleeve: { include: [] },
            size: { include: [] },
            color: { include: [], exclude: [] }
          }
        }
      ],

      setActivePersona: (id) => set({ activePersona: id, activeProfile: null, isDirty: false }),

      addPersona: (label, emoji) => set((state) => {
        const newId = "persona_" + Date.now();
        return {
          personas: [...state.personas, { id: newId, label, emoji }],
          activePersona: newId,
          activeProfile: null,
          isDirty: false
        };
      }),
  
  loadLiveConstraints: (c) => set((state) => {
    const dirty = state.activeProfile != null && !constraintsEqual(c, state.activeProfile.constraints);
    return { liveConstraints: c, isDirty: dirty };
  }),

  activateProfile: (profile) => set({
    activeProfile: profile,
    isDirty: false
  }),

  saveProfile: (name) => set((state) => {
    if (!state.liveConstraints) return state;
    const newProfile: ProfileVersion = {
      id: "prof_" + Date.now(),
      name,
      version: 1,
      personaId: state.activePersona,
      constraints: state.liveConstraints
    };
    return {
      profiles: [...state.profiles, newProfile],
      activeProfile: newProfile,
      isDirty: false
    };
  }),

  deleteProfile: (id) => set((state) => {
    return {
      profiles: state.profiles.filter(p => p.id !== id),
      activeProfile: state.activeProfile?.id === id ? null : state.activeProfile
    };
  }),

  // --- DAY 2 ACTIONS ---
  requestSave: () => set(() => {
    // Mocking the AI /drift endpoint
    return {
      driftResult: {
        decision: "new_version",
        reason: "You added a brand filter, narrowing down the results. This feels like a refinement of the original search.",
        fieldContributions: { brand: 1 }
      }
    };
  }),

  clearDrift: () => set({ driftResult: null }),

  confirmSave: (mode, name) => set((state) => {
    if (!state.activeProfile || !state.liveConstraints) return state;
    
    if (mode === "new_profile" && name) {
      // Handled just like saveProfile
      return state; // we'll just let the UI call saveProfile directly for this case to save time
    }
    
    // For new_version or update, we bump the version number
    const updatedProfile = {
      ...state.activeProfile,
      version: state.activeProfile.version + 1,
      constraints: state.liveConstraints
    };

    return {
      profiles: state.profiles.map(p => p.id === updatedProfile.id ? updatedProfile : p),
      activeProfile: updatedProfile,
      isDirty: false,
      driftResult: null
    };
  }),

  rollback: (profileId, toVersion) => set((state) => {
    // In a real app, this hits GET /profiles/:id?version=X
    // For MVP, we just decrement the version number and keep the constraints the same for visual effect
    const p = state.profiles.find(x => x.id === profileId);
    if (!p) return state;
    const rolledBack = { ...p, version: toVersion };
    return {
      profiles: state.profiles.map(x => x.id === profileId ? rolledBack : x),
      activeProfile: rolledBack,
      isDirty: false
    };
  })
}),
{
  name: "shelfie-storage-v2", // name of the item in localStorage
}
));
