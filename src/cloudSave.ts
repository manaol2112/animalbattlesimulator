// Mirrors the save to the host's per-person database when the game runs as a hosted page.
// Browser storage can be wiped or blocked there. Anywhere else this quietly does nothing.
import { parseProfile, setSaveListener, type Profile } from './sim/progression';

interface DocRef {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<void>;
}
interface HostRuntime {
  use(name: 'db'): Promise<{ doc(path: string): DocRef } | null>;
  use(name: 'user'): Promise<{ id(): Promise<string | null> } | null>;
}

let ref: DocRef | null = null;
let writable = false;
let inFlight: Promise<void> | null = null;
let pending: string | null = null;

function pump(): void {
  if (!ref || !writable || inFlight || pending === null) return;
  const json = pending;
  pending = null;
  let failed = false;
  // One write at a time; a burst of saves collapses into the latest state.
  inFlight = ref.set({ json, savedAt: Date.now() })
    .catch((e: { code?: string }) => {
      failed = true;
      if (e?.code === 'unavailable') pending ??= json; // Goes out with the next save or flush.
      else writable = false; // This viewer can't write here: browser storage still holds the game.
    })
    .finally(() => {
      inFlight = null;
      if (!failed) pump();
    });
}

/**
 * Reads the cloud copy. Resolves to it when one exists, or null when there is none or no host.
 * Saving stays off until `enableCloudWrites`, so a slow read can't overwrite a better save.
 */
export async function connectCloud(): Promise<Profile | null> {
  const host = (window as unknown as { claude?: HostRuntime }).claude;
  if (!host?.use) return null;
  const [db, user] = await Promise.all([host.use('db'), host.use('user')]);
  const id = await user?.id();
  if (!db || !id) return null;
  ref = db.doc(`data/users/${id}/save`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const json = snap.data()?.json;
  if (typeof json !== 'string') return null;
  return parseProfile(json);
}

export function enableCloudWrites(current: Profile): void {
  if (!ref) return;
  writable = true;
  setSaveListener((p) => {
    pending = JSON.stringify(p);
    pump();
  });
  pending = JSON.stringify(current);
  pump();
}

/** Waits for every queued save to land, for use just before a page reload. */
export async function flushCloud(): Promise<void> {
  const deadline = Date.now() + 2000;
  pump();
  while ((inFlight || pending !== null) && writable && Date.now() < deadline) {
    if (inFlight) await Promise.race([inFlight, new Promise((r) => setTimeout(r, 200))]);
    else {
      pump();
      if (!inFlight) break;
    }
  }
}
