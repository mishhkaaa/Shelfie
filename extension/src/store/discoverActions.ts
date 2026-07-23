import { api } from "../api/client";
import type { DiscoverItem } from "../api/types";

// Shared star/fork/fetch-feed bodies used by both the side panel's
// useShelfieStore and the in-page bundle's useInpageStore — two separate
// zustand store instances (bundles never share runtime state), but they
// must hit the exact same backend calls the exact same way, so the logic
// lives here once instead of copy-drifting across two stores.

export async function fetchDiscoverFeedAction(): Promise<{ profiles: DiscoverItem[] } | { error: string }> {
  try {
    const { profiles } = await api.discover();
    return { profiles };
  } catch (err) {
    console.error("Shelfie: fetchDiscoverFeed failed", err);
    return { error: "Couldn't load Discover feed — try again." };
  }
}

export async function starProfileAction(
  profileId: string
): Promise<{ starred: boolean; starsCount: number } | { error: string }> {
  try {
    return await api.star(profileId);
  } catch (err) {
    console.error("Shelfie: starProfile failed", err);
    return { error: "Couldn't update star — try again." };
  }
}

export async function forkProfileAction(
  profileId: string,
  personaId: string,
  name: string
): Promise<{ forked: Awaited<ReturnType<typeof api.fork>>; feed: DiscoverItem[] } | { error: string }> {
  if (!personaId || !name.trim()) {
    const message = "Choose a persona and a name to fork into first.";
    console.error("Shelfie: forkProfile no-op —", message, { profileId, personaId, name });
    return { error: message };
  }
  try {
    const forked = await api.fork(profileId, personaId, name);
    const { profiles } = await api.discover();
    return { forked, feed: profiles };
  } catch (err) {
    console.error("Shelfie: forkProfile failed", err);
    return { error: "Couldn't fork this profile — try again." };
  }
}
