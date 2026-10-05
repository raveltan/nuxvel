import { existsSync } from "node:fs";
import { join } from "node:path";
import { dockerBuildArgs } from "./docker-build-args.ts";
import { step, style } from "../ui/output.ts";
import { runDocker } from "./run-docker.ts";

interface BuildImageOptions {
  cwd: string;
  /** Docker platforms to build for, e.g. `["linux/amd64", "linux/arm64"]`. */
  platforms: string[];
  /** Image name and tag, e.g. `registry.example.com/app:1.4.0`. */
  image: string;
  /** Push the image to its registry instead of loading it into the local Docker. */
  push: boolean;
}

/**
 * Builds the `runtime` stage of the app's Dockerfile with Docker Buildx,
 * inside Linux containers, for every platform at once, reported as one
 * finished step with its duration. Resolves with Buildx's exit code.
 *
 * @throws when the app has no `Dockerfile`.
 */
export async function buildImage(options: BuildImageOptions) {
  if (!existsSync(join(options.cwd, "Dockerfile"))) {
    throw new Error(`No Dockerfile in ${options.cwd}`);
  }

  const startedAt = performance.now();
  const code = await runDocker(options.cwd, [
    "buildx",
    "build",
    "--platform",
    options.platforms.join(","),
    "--target",
    "runtime",
    "--tag",
    options.image,
    ...dockerBuildArgs(options.cwd),
    options.push ? "--push" : "--load",
    ".",
  ]);

  if (code === 0) {
    step(`Built ${options.image} for ${options.platforms.join(", ")} ${style.duration(performance.now() - startedAt)}`);
  }

  return code;
}
