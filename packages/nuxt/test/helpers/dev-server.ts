import { playgroundDir, probesLayer, testBuildDir } from "./test-builds";

export function devServerOptions() {
  const buildDir = testBuildDir("dev");

  return {
    rootDir: playgroundDir,
    dev: true,
    nuxtConfig: { buildDir, extends: [probesLayer] },
    env: { PLAYGROUND_BUILD_DIR: buildDir, PLAYGROUND_PROBES_LAYER: "1" },
  };
}
