import type { CollectedEntry } from "./collected-entry";

const MAX_ENTRIES = 200;

const entries: CollectedEntry[] = [];

export function storeEntry(entry: CollectedEntry) {
  const existing = entries.findIndex((candidate) => candidate.id === entry.id);

  if (existing !== -1) entries.splice(existing, 1);

  entries.unshift(entry);
  entries.length = Math.min(entries.length, MAX_ENTRIES);
}

/**
 * The finished entries the dev collector holds, newest first: at most
 * the last 200, from this server's requests and from the job runs and
 * commands `queue:work` / `task:run` / `tinker` send over the Redis
 * stream. Empty outside development, where nothing collects.
 */
export function recentEntries(): readonly CollectedEntry[] {
  return entries;
}

/** The finished entry with this id, or `undefined` once it left the buffer. */
export function collectedEntry(id: string): CollectedEntry | undefined {
  return entries.find((entry) => entry.id === id);
}
