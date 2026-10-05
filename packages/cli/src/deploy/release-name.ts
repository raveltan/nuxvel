export function releaseName(now: Date, commit: string | null) {
  const time = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

  return commit ? `${time}-${commit.slice(0, 7)}` : time;
}
