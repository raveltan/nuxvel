import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect } from "@nuxvel/nuxt/testing";
import { describe, it, onTestFinished } from "vitest";
import {
  TEST_ADMIN_DATABASE_URL,
  TEST_COMPOSE_FILE,
  TEST_COMPOSE_PROJECT,
  TEST_MAILPIT_URL,
  TEST_MAIL_URL,
  TEST_REDIS_URL,
  TEST_STORAGE_URL,
  servicesHealthy,
} from "@nuxvel/test-helpers/services";

const compose = (project: string, args: string[], env: NodeJS.ProcessEnv = process.env) =>
  promisify(execFile)("docker", ["compose", "-f", TEST_COMPOSE_FILE, "-p", project, ...args], { env });

async function publishedPort(service: string, containerPort: number) {
  const { stdout } = await promisify(execFile)("docker", [
    "compose",
    "-f",
    TEST_COMPOSE_FILE,
    "-p",
    TEST_COMPOSE_PROJECT,
    "port",
    service,
    String(containerPort),
  ]);

  return stdout.trim();
}

describe("test services global setup", () => {
  it("runs the compose project this run names, on the ports of its test URLs, on 127.0.0.1 only", async () => {
    const published = await Promise.all([
      publishedPort("postgres", 5432),
      publishedPort("redis", 6379),
      publishedPort("mailpit", 1025),
      publishedPort("mailpit", 8025),
      publishedPort("seaweedfs", 8333),
    ]);

    expect(published).toEqual(
      [TEST_ADMIN_DATABASE_URL, TEST_REDIS_URL, TEST_MAIL_URL, TEST_MAILPIT_URL, TEST_STORAGE_URL].map(
        (url) => `127.0.0.1:${new URL(url).port}`,
      ),
    );
  });

  it("sees the running stack as healthy, and a compose project without containers as not healthy", async () => {
    expect(await servicesHealthy()).toBe(true);
    expect(await servicesHealthy(`${TEST_COMPOSE_PROJECT}-absent`)).toBe(false);
  });

  it("sees a healthy stack started from another compose config as not healthy, so the setup recreates it", async () => {
    const stale = `${TEST_COMPOSE_PROJECT}-stale-${process.pid}`;
    onTestFinished(async () => {
      await compose(stale, ["down", "-t", "0"]);
    });
    const otherPorts = Object.fromEntries(
      ["POSTGRES", "REDIS", "SMTP", "MAILPIT", "STORAGE"].map((service) => [`NUXVEL_TEST_${service}_PORT`, "0"]),
    );
    await compose(stale, ["up", "-d", "--wait"], { ...process.env, ...otherPorts });

    expect(await servicesHealthy(stale)).toBe(false);
  }, 60_000);
});
