import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

export const TEST_ADMIN_DATABASE_URL =
  process.env.NUXT_DATABASE_TEST_URL ?? "postgres://nuxvel:nuxvel@localhost:5433/postgres";
export const TEST_REDIS_URL = process.env.NUXT_REDIS_TEST_URL ?? "redis://localhost:6380";
export const TEST_MAIL_URL = process.env.NUXT_MAIL_TEST_URL ?? "smtp://localhost:1026";
export const TEST_MAILPIT_URL = process.env.NUXT_MAILPIT_TEST_URL ?? "http://localhost:8026";
export const TEST_STORAGE_URL = process.env.NUXT_STORAGE_TEST_URL ?? "http://nuxvel:nuxvel-secret@localhost:8334";

export const TEST_COMPOSE_FILE = fileURLToPath(new URL("../../../docker-compose.test.yml", import.meta.url));
export const TEST_COMPOSE_PROJECT = process.env.NUXVEL_TEST_COMPOSE_PROJECT || "nuxvel-test";

const portOf = (url: string) => new URL(url).port;

const composeEnv = {
  ...process.env,
  NUXVEL_TEST_POSTGRES_PORT: portOf(TEST_ADMIN_DATABASE_URL),
  NUXVEL_TEST_REDIS_PORT: portOf(TEST_REDIS_URL),
  NUXVEL_TEST_SMTP_PORT: portOf(TEST_MAIL_URL),
  NUXVEL_TEST_MAILPIT_PORT: portOf(TEST_MAILPIT_URL),
  NUXVEL_TEST_STORAGE_PORT: portOf(TEST_STORAGE_URL),
};

function parseContainers(output: string): { Service: string; Health?: string; Labels?: string }[] {
  const trimmed = output.trim();
  if (trimmed.startsWith("[")) return JSON.parse(trimmed);
  return trimmed
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

/**
 * Tells whether every service of the test compose project runs, is healthy and was created from the current
 * `docker-compose.test.yml` and test ports. A stack started from an older file counts as not healthy, so the
 * global setup recreates it.
 */
export async function servicesHealthy(project = TEST_COMPOSE_PROJECT) {
  const compose = (args: string[]) =>
    promisify(execFile)("docker", ["compose", "-f", TEST_COMPOSE_FILE, "-p", project, ...args], { env: composeEnv }).catch(() => ({
      stdout: "",
    }));
  const [config, ps] = await Promise.all([compose(["config", "--hash", "*"]), compose(["ps", "--format", "json"])]);
  const hashes = config.stdout
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.trim().split(/\s+/));
  const containers = parseContainers(ps.stdout);

  return (
    hashes.length > 0 &&
    hashes.every(([service, hash]) =>
      containers.some(
        (entry) =>
          entry.Service === service &&
          entry.Health === "healthy" &&
          entry.Labels?.match(/com\.docker\.compose\.config-hash=([0-9a-f]+)/)?.[1] === hash,
      ),
    )
  );
}

export async function setup() {
  // the Stripe SDK writes a Claude Code hint on stderr when an agent runs the tests, and the CLI tests read a command's stderr
  delete process.env.CLAUDECODE;
  delete process.env.CLAUDE_CODE_CHILD_SESSION;

  if (await servicesHealthy()) return;

  await promisify(execFile)("docker", ["compose", "-f", TEST_COMPOSE_FILE, "-p", TEST_COMPOSE_PROJECT, "up", "-d", "--wait"], {
    env: composeEnv,
  }).catch((error: { stderr?: string }) => {
    throw new Error(
      `could not start the test services (docker-compose.test.yml, project ${TEST_COMPOSE_PROJECT}):\n${error.stderr ?? error}`,
    );
  });

  return async () => {
    await promisify(execFile)("docker", ["compose", "-f", TEST_COMPOSE_FILE, "-p", TEST_COMPOSE_PROJECT, "down"]);
  };
}
