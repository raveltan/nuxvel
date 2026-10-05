import type { CollectedEntry } from "./collected-entry";

const rawParams = new WeakMap<CollectedEntry, Map<number, readonly unknown[]>>();

export function keepRawParams(entry: CollectedEntry, spanIndex: number, params: readonly unknown[]) {
  const kept = rawParams.get(entry) ?? new Map<number, readonly unknown[]>();

  kept.set(spanIndex, params);
  rawParams.set(entry, kept);
}

export function rawQueryParams(entry: CollectedEntry, spanIndex: number) {
  return rawParams.get(entry)?.get(spanIndex);
}
