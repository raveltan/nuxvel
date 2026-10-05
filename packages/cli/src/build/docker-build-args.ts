import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function nodeVersion(cwd: string) {
  const nvmrc = join(cwd, ".nvmrc");

  return existsSync(nvmrc) ? readFileSync(nvmrc, "utf8").trim().replace(/^v/, "") : undefined;
}

function gitCommit(cwd: string) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

/**
 * The `--build-arg`s every `nuxvel build` passes to the app's
 * Dockerfile: `NODE_VERSION` from `.nvmrc`, so the image runs the Node
 * version the app pins, and the git commit and build source the build
 * manifest records, which the Docker build cannot see itself.
 */
export function dockerBuildArgs(cwd: string) {
  const version = nodeVersion(cwd);
  const commit = gitCommit(cwd);

  return [
    ...(version ? ["--build-arg", `NODE_VERSION=${version}`] : []),
    ...(commit ? ["--build-arg", `NUXVEL_GIT_COMMIT=${commit}`] : []),
    "--build-arg",
    `NUXVEL_BUILD_SOURCE=${process.env.CI ? "ci" : "local"}`,
  ];
}
