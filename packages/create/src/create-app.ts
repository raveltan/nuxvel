import { randomBytes } from "node:crypto";
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "../package.json" with { type: "json" };
import { packageNameFor } from "./package-name.ts";

const templateDir = fileURLToPath(new URL("../template", import.meta.url));
const packagesDir = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Options for {@link createApp}.
 */
export interface CreateAppOptions {
  /** Directory the app is written to; created if missing, refused if not empty. */
  targetDir: string;
  /**
   * Depend on `@nuxvel/nuxt` and `@nuxvel/cli` through `file:` links into
   * the nuxvel checkout this scaffolder runs from, instead of the npm
   * registry, and write an `.npmrc` that installs them as copies with
   * their own dependencies. For trying unreleased changes to nuxvel.
   */
  local?: boolean;
}

function nuxvelVersion(name: "nuxt" | "cli", local: boolean) {
  return local ? `file:${join(packagesDir, name)}` : `^${pkg.version}`;
}

function writePackageJson(targetDir: string, name: string, local: boolean) {
  const path = join(targetDir, "package.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));

  manifest.name = name;
  manifest.dependencies["@nuxvel/nuxt"] = nuxvelVersion("nuxt", local);
  manifest.devDependencies["@nuxvel/cli"] = nuxvelVersion("cli", local);

  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

function writeEnv(targetDir: string) {
  const example = readFileSync(join(targetDir, ".env.example"), "utf8");
  const secret = randomBytes(32).toString("base64url");

  writeFileSync(
    join(targetDir, ".env"),
    example.replace(/^NUXT_AUTH_SECRET=.*$/m, `NUXT_AUTH_SECRET=${secret}`),
  );
}

/**
 * Scaffolds a fresh Nuxt app with nuxvel installed: the framework's
 * tables and their migrations, Docker Compose dev services (Postgres,
 * Redis, Mailpit, SeaweedFS), a `.env` with a generated
 * `NUXT_AUTH_SECRET`, a Dockerfile, a GitHub Actions workflow, and a
 * functional test that `nuxvel test:functional` passes out of the box.
 *
 * Only writes files — installing dependencies is left to the caller.
 * `@nuxvel/nuxt` and `@nuxvel/cli` are pinned to this scaffolder's own
 * version range (`^<version>`), or linked with `local`. The package's
 * `name` is the directory's name as a valid npm name (`My App` becomes
 * `my-app`); it is also the app's `https://<name>.localhost` in dev.
 *
 * @throws when `targetDir` exists and is not empty, or when its name
 * has no letters or digits to make a package name from.
 *
 * @example
 * createApp({ targetDir: "my-app" });
 */
export function createApp(options: CreateAppOptions) {
  const targetDir = resolve(options.targetDir);
  const name = packageNameFor(targetDir);

  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    throw new Error(`${targetDir} is not empty`);
  }

  cpSync(templateDir, targetDir, { recursive: true });
  renameSync(join(targetDir, "_gitignore"), join(targetDir, ".gitignore"));
  writePackageJson(targetDir, name, options.local ?? false);
  writeEnv(targetDir);

  if (options.local) writeFileSync(join(targetDir, ".npmrc"), "install-links=true\n");

  return targetDir;
}
