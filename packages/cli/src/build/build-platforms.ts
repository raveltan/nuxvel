const DOCKER_ARCH: Partial<Record<NodeJS.Architecture, string>> = { x64: "amd64", arm64: "arm64" };

function hostPlatform() {
  return `linux/${DOCKER_ARCH[process.arch] ?? process.arch}`;
}

/**
 * Splits a `--platform` value like `linux/amd64,linux/arm64` into its
 * platforms, falling back to the Linux platform of this machine.
 */
export function parsePlatforms(value: string | undefined) {
  const platforms = (value ?? "")
    .split(",")
    .map((platform) => platform.trim())
    .filter(Boolean);

  return platforms.length > 0 ? platforms : [hostPlatform()];
}
