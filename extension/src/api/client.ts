import type {
  AccountSettings,
  CommitResponse,
  Constraints,
  DiscoverItem,
  DriftResponse,
  ObserveResponse,
  ProfileVersion,
} from "./types";

// No configurable settings field exists in the extension UI for this (see
// FRONTEND_CHANGES_LOG.md) — hardcoded default matching the backend's fixed
// dev port (master prompt Section 2).
const BACKEND_URL = "http://localhost:8000";

const ACCOUNT_ID_STORAGE_KEY = "shelfie_account_id";

let cachedAccountId: string | null = null;

async function getAccountId(): Promise<string> {
  if (cachedAccountId) return cachedAccountId;

  const stored = await chrome.storage.local.get(ACCOUNT_ID_STORAGE_KEY);
  const existing = stored[ACCOUNT_ID_STORAGE_KEY];
  if (typeof existing === "string" && existing) {
    cachedAccountId = existing;
    return existing;
  }

  const newId = crypto.randomUUID();
  await chrome.storage.local.set({ [ACCOUNT_ID_STORAGE_KEY]: newId });
  cachedAccountId = newId;
  return newId;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const accountId = await getAccountId();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Account-Id": accountId,
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Shelfie API ${path} failed: ${res.status} ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface PersonaOut {
  id: string;
  name: string;
}

export const api = {
  listPersonas: () => request<{ personas: PersonaOut[] }>("/personas"),

  createPersona: (name: string) =>
    request<PersonaOut>("/personas", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  listProfiles: (personaId: string) =>
    request<{ profiles: ProfileVersion[] }>(`/profiles?personaId=${encodeURIComponent(personaId)}`),

  getProfile: (id: string) => request<ProfileVersion>(`/profiles/${encodeURIComponent(id)}`),

  createProfile: (name: string, personaId: string, constraints: Constraints) =>
    request<ProfileVersion>("/profiles", {
      method: "POST",
      body: JSON.stringify({ name, personaId, constraints }),
    }),

  deleteProfile: (id: string) =>
    request<{ archived: true }>(`/profiles/${encodeURIComponent(id)}`, { method: "DELETE" }),

  drift: (profileId: string, liveConstraints: Constraints) =>
    request<DriftResponse>(`/profiles/${encodeURIComponent(profileId)}/drift`, {
      method: "POST",
      body: JSON.stringify({ liveConstraints }),
    }),

  commit: (
    profileId: string,
    mode: "new_version" | "update" | "new_profile",
    constraints: Constraints,
    name?: string
  ) =>
    request<CommitResponse>(`/profiles/${encodeURIComponent(profileId)}/commit`, {
      method: "POST",
      body: JSON.stringify({ mode, constraints, name }),
    }),

  rollback: (profileId: string, targetVersion: number) =>
    request<ProfileVersion>(`/profiles/${encodeURIComponent(profileId)}/rollback`, {
      method: "POST",
      body: JSON.stringify({ targetVersion }),
    }),

  suggestName: (constraints: Constraints) =>
    request<{ suggestedName: string | null; suggestedDescription: string | null }>("/ai/suggest-name", {
      method: "POST",
      body: JSON.stringify({ constraints }),
    }),

  // --- Collaboration (master prompt Part 2, Section 2) ---
  setVisibility: (profileId: string, visibility: "private" | "public") =>
    request<ProfileVersion>(`/profiles/${encodeURIComponent(profileId)}/visibility`, {
      method: "PATCH",
      body: JSON.stringify({ visibility }),
    }),

  discover: (limit = 20, offset = 0) =>
    request<{ profiles: DiscoverItem[] }>(`/discover?limit=${limit}&offset=${offset}`),

  star: (profileId: string) =>
    request<{ starred: boolean; starsCount: number }>(`/discover/${encodeURIComponent(profileId)}/star`, {
      method: "POST",
    }),

  fork: (profileId: string, personaId: string, name: string) =>
    request<ProfileVersion>(`/discover/${encodeURIComponent(profileId)}/fork`, {
      method: "POST",
      body: JSON.stringify({ personaId, name }),
    }),

  // --- Behavioural suggestions (master prompt Part 2, Section 3) ---
  getAccountSettings: () => request<AccountSettings>("/accounts/settings"),

  updateAccountSettings: (settings: AccountSettings) =>
    request<AccountSettings>("/accounts/settings", {
      method: "PATCH",
      body: JSON.stringify(settings),
    }),

  observeBehaviour: (personaId: string, constraints: Constraints) =>
    request<ObserveResponse>("/behaviour/observe", {
      method: "POST",
      body: JSON.stringify({ personaId, constraints }),
    }),
};
