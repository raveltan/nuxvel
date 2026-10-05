const hits = new Map<string, number>();

export function recordRenderingSentinel(mode: string) {
  hits.set(mode, (hits.get(mode) ?? 0) + 1);
}

export function renderingSentinelHits(mode: string) {
  return hits.get(mode) ?? 0;
}
