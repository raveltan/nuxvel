import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dockerBuildArgs } from "./docker-build-args.ts";
import { type ArchiveFormat, packArchive } from "./pack-archive.ts";
import { step, style } from "../ui/output.ts";
import { runDocker } from "./run-docker.ts";

interface BuildArtifactOptions {
  cwd: string;
  /** Docker platforms to build for, e.g. `["linux/arm64"]`; one archive each. */
  platforms: string[];
  /** `tar` for a `.tar.gz`, `zip` for a `.zip`. */
  format: ArchiveFormat;
}

function archiveName(cwd: string, platform: string, format: ArchiveFormat) {
  const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  const name = String(pkg.name ?? "app").replace(/^@.*\//, "");
  const parts = [name, pkg.version, platform.replaceAll("/", "-")].filter(Boolean);

  return `${parts.join("-")}.${format === "zip" ? "zip" : "tar.gz"}`;
}

async function buildPlatform(options: BuildArtifactOptions, platform: string, file: string) {
  const outputDir = mkdtempSync(join(tmpdir(), "nuxvel-artifact-"));

  try {
    const code = await runDocker(options.cwd, [
      "buildx",
      "build",
      "--platform",
      platform,
      "--target",
      "artifact",
      "--output",
      `type=local,dest=${outputDir}`,
      ...dockerBuildArgs(options.cwd),
      ".",
    ]);

    if (code === 0) await packArchive(outputDir, file, options.format);

    return code;
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

/**
 * Builds the `artifact` stage of the app's Dockerfile with Docker Buildx
 * for each platform, and packs it into `dist/<app>-<version>-<os>-<arch>`
 * with a `.sha256` checksum beside it. The archive holds `.output/`, the
 * migrations in `server/database/migrations/` and `nuxvel-manifest.json`.
 *
 * Reports each platform as a finished step with its duration, and
 * resolves with the archive paths, or with Buildx's exit code when a
 * build fails.
 *
 * @throws when the app has no `Dockerfile`.
 */
export async function buildArtifact(options: BuildArtifactOptions) {
  if (!existsSync(join(options.cwd, "Dockerfile"))) {
    throw new Error(`No Dockerfile in ${options.cwd}`);
  }

  const distDir = join(options.cwd, "dist");
  mkdirSync(distDir, { recursive: true });
  const archives: string[] = [];

  for (const platform of options.platforms) {
    const file = join(distDir, archiveName(options.cwd, platform, options.format));
    const startedAt = performance.now();
    const code = await buildPlatform(options, platform, file);

    if (code !== 0) return { code, archives };
    step(`Built ${platform} ${style.duration(performance.now() - startedAt)}`);
    archives.push(file);
  }

  return { code: 0, archives };
}
