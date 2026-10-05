import { randomBytes, randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "@nuxvel/test-helpers/cli";
import { freePort } from "@nuxvel/test-helpers/free-port";
import { packNuxvel } from "@nuxvel/test-helpers/pack-nuxvel";
import { run } from "@nuxvel/test-helpers/run";
import { TEST_ADMIN_DATABASE_URL, TEST_MAIL_URL, TEST_REDIS_URL } from "@nuxvel/test-helpers/services";
import { Queue, QueueEvents } from "bullmq";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runCliAt } from "./helpers/run.ts";

const createEntry = fileURLToPath(new URL("../../create/bin/create-nuxvel.mjs", import.meta.url));
const packagesDir = fileURLToPath(new URL("../..", import.meta.url));

const HOST_PLATFORM = `linux/${process.arch === "x64" ? "amd64" : process.arch}`;

function redisDatabaseUrl(database: number) {
  const url = new URL(TEST_REDIS_URL);
  url.pathname = `/${database}`;
  return url.toString();
}

async function createDatabase() {
  const name = `nuxvel_build_${randomUUID().replaceAll("-", "_")}`;
  const admin = postgres(TEST_ADMIN_DATABASE_URL, { max: 1 });

  try {
    await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }

  const url = new URL(TEST_ADMIN_DATABASE_URL);
  url.pathname = `/${name}`;

  return { name, url: url.toString() };
}

async function dropDatabase(name: string) {
  const admin = postgres(TEST_ADMIN_DATABASE_URL, { max: 1 });

  try {
    await admin.unsafe(`drop database if exists "${name}" with (force)`);
  } finally {
    await admin.end();
  }
}

async function publishedPort(container: string) {
  const { output } = await run("docker", ["port", container, "3000"], process.cwd());
  return output.trim().split("\n")[0];
}

async function waitForReady(container: string) {
  return vi
    .waitFor(
      async () => {
        const response = await fetch(`http://${await publishedPort(container)}/api/health/ready`);
        if (!response.ok) throw new Error(`ready answered ${response.status}`);
        return response;
      },
      { timeout: 60000, interval: 500 },
    )
    .catch(async () => {
      const logs = await run("docker", ["logs", container], process.cwd());
      throw new Error(`${container} never became ready:\n${logs.output}`);
    });
}

function listTree(dir: string) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .map((entry) => {
      const type = entry.isSymbolicLink() ? "link" : entry.isDirectory() ? "dir" : "file";
      return `${type} ${relative(dir, join(entry.parentPath, entry.name))}`;
    })
    .sort();
}

function containerUrl(url: string) {
  const parsed = new URL(url);
  parsed.hostname = "host.docker.internal";
  return parsed.toString();
}

async function vendorNuxvel(appDir: string) {
  const { vendorDir, nuxt, cli } = await packNuxvel(join(appDir, ".."));
  cpSync(vendorDir, join(appDir, "vendor"), { recursive: true });

  const manifestPath = join(appDir, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.dependencies["@nuxvel/nuxt"] = `file:vendor/${nuxt}`;
  manifest.devDependencies["@nuxvel/cli"] = `file:vendor/${cli}`;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const dockerfilePath = join(appDir, "Dockerfile");
  writeFileSync(
    dockerfilePath,
    readFileSync(dockerfilePath, "utf8").replace(
      "COPY package.json package-lock.json ./\n",
      "COPY package.json package-lock.json ./\nCOPY vendor ./vendor\n",
    ),
  );
}

async function scaffoldBuildableApp(scratchDir: string) {
  const appDir = join(scratchDir, "nuxvel-build-test-app");

  const created = await run("node", [createEntry, appDir, "--local"], scratchDir);
  expect(created.exitCode, created.output).toBe(0);

  rmSync(join(appDir, ".npmrc"));
  await vendorNuxvel(appDir);

  const locked = await run(
    "npm",
    ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"],
    appDir,
  );
  expect(locked.exitCode, locked.output).toBe(0);

  return appDir;
}

async function waitForHealthy(container: string) {
  await vi
    .waitFor(
      async () => {
        const { output } = await run("docker", ["inspect", "--format", "{{.State.Health.Status}}", container], process.cwd());
        if (output.trim() !== "healthy") throw new Error(output);
      },
      { timeout: 60000, interval: 1000 },
    )
    .catch(async () => {
      const logs = await run("docker", ["logs", container], process.cwd());
      throw new Error(`${container} never became healthy:\n${logs.output}`);
    });
}

describe("nuxvel build", () => {
  let scratchDir: string;
  let appDir: string;

  beforeAll(async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-build-"));
    appDir = await scaffoldBuildableApp(scratchDir);
  }, 300000);

  afterAll(() => {
    rmSync(scratchDir, { recursive: true, force: true });
  });

  it("builds an image for the host's platform that serves the healthcheck endpoint and, with NUXVEL_ROLE=worker, runs a job", async () => {
    const image = `nuxvel-build-test:${randomUUID()}`;
    const container = `nuxvel-build-test-${randomUUID()}`;
    const worker = `nuxvel-build-test-worker-${randomUUID()}`;
    const database = await createDatabase();
    const connection = { url: redisDatabaseUrl(6), maxRetriesPerRequest: null };
    const queue = new Queue("nuxvel", { connection });
    const queueEvents = new QueueEvents("nuxvel", { connection });

    try {
      const built = await runCliAt(appDir, "build", `--platform=${HOST_PLATFORM}`, `--image=${image}`);
      expect(built.exitCode, built.output).toBe(0);

      const started = await run(
        "docker",
        [
          "run",
          "--detach",
          "--name",
          container,
          "--add-host=host.docker.internal:host-gateway",
          "--publish",
          "127.0.0.1::3000",
          "--env",
          `NUXT_AUTH_SECRET=${randomBytes(32).toString("hex")}`,
          "--env",
          "NUXT_SITE_URL=http://localhost:3000",
          "--env",
          `NUXT_AUDIT_CHAIN_SECRET=${randomBytes(32).toString("hex")}`,
          "--env",
          `NUXT_OG_IMAGE_SECRET=${randomBytes(32).toString("hex")}`,
          "--env",
          `NUXT_DATABASE_URL=${containerUrl(TEST_ADMIN_DATABASE_URL)}`,
          "--env",
          `NUXT_REDIS_URL=${containerUrl(redisDatabaseUrl(5))}`,
          "--env",
          `NUXT_MAIL_URL=${containerUrl(TEST_MAIL_URL)}`,
          image,
        ],
        appDir,
      );
      expect(started.exitCode, started.output).toBe(0);

      await waitForHealthy(container);

      const response = await fetch(`http://${await publishedPort(container)}/api/health/live`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "live" });

      const migrationsDir = join(scratchDir, "migrations-only");
      cpSync(join(appDir, "server/database/migrations"), join(migrationsDir, "server/database/migrations"), { recursive: true });
      await migrate(migrationsDir, { ...process.env, NUXT_DATABASE_URL: database.url });
      await queue.obliterate({ force: true });

      const workerStarted = await run(
        "docker",
        [
          "run",
          "--detach",
          "--name",
          worker,
          "--add-host=host.docker.internal:host-gateway",
          "--env",
          "NUXVEL_ROLE=worker",
          "--env",
          `NUXT_AUTH_SECRET=${randomBytes(32).toString("hex")}`,
          "--env",
          "NUXT_SITE_URL=http://localhost:3000",
          "--env",
          `NUXT_AUDIT_CHAIN_SECRET=${randomBytes(32).toString("hex")}`,
          "--env",
          `NUXT_OG_IMAGE_SECRET=${randomBytes(32).toString("hex")}`,
          "--env",
          `NUXT_DATABASE_URL=${containerUrl(database.url)}`,
          "--env",
          `NUXT_REDIS_URL=${containerUrl(redisDatabaseUrl(6))}`,
          "--env",
          `NUXT_MAIL_URL=${containerUrl(TEST_MAIL_URL)}`,
          image,
        ],
        appDir,
      );
      expect(workerStarted.exitCode, workerStarted.output).toBe(0);

      const job = await queue.add("nuxvel.prune-outbox", {});
      const finished = await job.waitUntilFinished(queueEvents, 60000).then(
        () => true,
        () => false,
      );

      const logs = await run("docker", ["logs", worker], appDir);
      expect(finished, logs.output).toBe(true);
      const jobLines = logs.output
        .split("\n")
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line) as { level: string; tag: string; msg: string; name?: string })
        .filter((line) => line.tag === "job");
      expect(jobLines, logs.output).toContainEqual(
        expect.objectContaining({ level: "info", msg: expect.stringContaining('worker listening on queues "default", "mail"') }),
      );
      expect(jobLines, logs.output).toContainEqual(
        expect.objectContaining({ level: "info", name: "nuxvel.prune-outbox", msg: expect.stringMatching(/ done$/) }),
      );
    } finally {
      await queueEvents.close();
      await queue.close();
      await run("docker", ["rm", "--force", container, worker], appDir);
      await run("docker", ["rmi", "--force", image], appDir);
      await dropDatabase(database.name);
    }
  }, 600000);

  it("exports a runnable archive that migrates a fresh database with its own migrate entry and serves requests", async () => {
    const archiveName = `nuxvel-build-test-app-${HOST_PLATFORM.replace("/", "-")}.tar.gz`;
    const archive = join(appDir, "dist", archiveName);
    const releaseDir = join(scratchDir, "release");
    const container = `nuxvel-build-test-${randomUUID()}`;
    const database = await createDatabase();

    try {
      const built = await runCliAt(appDir, "build", "--artifact", `--platform=${HOST_PLATFORM}`);
      expect(built.exitCode, built.output).toBe(0);
      expect(built.output).toContain(`Built dist/${archiveName}`);

      const [checksum, file] = readFileSync(`${archive}.sha256`, "utf8").trim().split(/\s+/);
      expect(file).toBe(archiveName);
      expect(checksum).toMatch(/^[0-9a-f]{64}$/);

      mkdirSync(releaseDir);
      const extracted = await run("tar", ["-xzf", archive, "-C", releaseDir], scratchDir);
      expect(extracted.exitCode, extracted.output).toBe(0);
      expect(readdirSync(releaseDir).sort()).toEqual([".output", "nuxvel-manifest.json", "nuxvel-routes.json", "server"]);
      expect(JSON.parse(readFileSync(join(releaseDir, "nuxvel-routes.json"), "utf8")).procedures).toContainEqual(
        expect.objectContaining({ name: "apiKeys.create", type: "mutation" }),
      );
      expect(existsSync(join(releaseDir, "server/database/migrations/meta/_journal.json"))).toBe(true);

      const manifest = JSON.parse(readFileSync(join(releaseDir, "nuxvel-manifest.json"), "utf8"));
      expect(manifest).toMatchObject({
        app: "nuxvel-build-test-app",
        version: null,
        source: process.env.CI ? "ci" : "local",
        platform: "linux",
        arch: process.arch,
        libc: "glibc",
        nuxvel: JSON.parse(readFileSync(join(packagesDir, "nuxt", "package.json"), "utf8")).version,
        migrations: readdirSync(join(appDir, "server", "database", "migrations")).filter((file) => file.endsWith(".sql")).length,
      });
      expect(manifest.node.split(".")[0]).toBe(readFileSync(join(appDir, ".nvmrc"), "utf8").trim());

      const migrated = await run(
        "docker",
        [
          "run",
          "--rm",
          "--add-host=host.docker.internal:host-gateway",
          "--volume",
          `${releaseDir}:/app:ro`,
          "--workdir",
          "/app",
          "--env",
          `NUXT_DATABASE_OWNER_URL=${containerUrl(database.url)}`,
          "node:24-bookworm-slim",
          "node",
          ".output/server/nuxvel/migrate.mjs",
        ],
        appDir,
      );
      expect(migrated.exitCode, migrated.output).toBe(0);
      expect(migrated.output).toContain("nuxvel migrate: the database is up to date");

      const sitePort = await freePort();
      const origin = `http://127.0.0.1:${sitePort}`;
      const started = await run(
        "docker",
        [
          "run",
          "--detach",
          "--name",
          container,
          "--add-host=host.docker.internal:host-gateway",
          "--publish",
          `127.0.0.1:${sitePort}:3000`,
          "--volume",
          `${releaseDir}:/app:ro`,
          "--workdir",
          "/app",
          "--env",
          "NODE_ENV=production",
          "--env",
          `NUXT_AUTH_SECRET=${randomBytes(32).toString("hex")}`,
          "--env",
          `NUXT_SITE_URL=${origin}`,
          "--env",
          `NUXT_AUDIT_CHAIN_SECRET=${randomBytes(32).toString("hex")}`,
          "--env",
          `NUXT_OG_IMAGE_SECRET=${randomBytes(32).toString("hex")}`,
          "--env",
          `NUXT_DATABASE_URL=${containerUrl(database.url)}`,
          "--env",
          `NUXT_REDIS_URL=${containerUrl(redisDatabaseUrl(5))}`,
          "--env",
          `NUXT_MAIL_URL=${containerUrl(TEST_MAIL_URL)}`,
          "node:24-bookworm-slim",
          "node",
          ".output/server/index.mjs",
        ],
        appDir,
      );
      expect(started.exitCode, started.output).toBe(0);

      const ready = await waitForReady(container);
      expect(await ready.json()).toEqual({ status: "ready", database: "reachable", redis: "reachable", disk: "ok" });

      const signUp = await fetch(`${origin}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({
          name: "Build Test",
          email: "build-test@example.com",
          password: "correct-horse-battery-staple",
        }),
      });
      expect(signUp.status, await signUp.clone().text()).toBe(200);

      const sql = postgres(database.url, { max: 1 });
      try {
        const users = await sql`select email from "user"`;
        expect(users.map((user) => user.email)).toEqual(["build-test@example.com"]);
      } finally {
        await sql.end();
      }

      const zipped = await runCliAt(appDir, "build", "--artifact", "--format=zip", `--platform=${HOST_PLATFORM}`);
      expect(zipped.exitCode, zipped.output).toBe(0);
      const zipDir = join(scratchDir, "release-zip");
      mkdirSync(zipDir);
      const unzipped = await run("unzip", ["-q", archive.replace(/\.tar\.gz$/, ".zip"), "-d", zipDir], appDir);
      expect(unzipped.exitCode, unzipped.output).toBe(0);
      expect(listTree(zipDir)).toEqual(listTree(releaseDir));
      expect(listTree(zipDir).filter((entry) => entry.startsWith("link "))).not.toEqual([]);

      for (const built of [archive, archive.replace(/\.tar\.gz$/, ".zip")]) {
        const verified = await runCliAt(appDir, "build:verify", built);
        expect(verified.output).not.toMatch(/checksum mismatch|is missing/);
        expect(verified.output).toMatch(/verified: nuxvel-build-test-app|built for linux\//);
      }
    } finally {
      await run("docker", ["rm", "--force", container], appDir);
      await dropDatabase(database.name);
    }
  }, 600000);
});
