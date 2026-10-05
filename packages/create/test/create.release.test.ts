import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { freePort } from "@nuxvel/test-helpers/free-port";
import { packNuxvel } from "@nuxvel/test-helpers/pack-nuxvel";
import { run } from "@nuxvel/test-helpers/run";

const createEntry = fileURLToPath(new URL("../bin/create-nuxvel.mjs", import.meta.url));
const repoEnvExample = fileURLToPath(new URL("../../../.env.example", import.meta.url));

function testDatabaseUrl(env: string) {
  const ownerUrl = new URL(env.match(/^NUXT_DATABASE_OWNER_URL=(.*)$/m)?.[1] ?? "");
  ownerUrl.pathname = `${ownerUrl.pathname}_test`;
  return ownerUrl.toString();
}

async function moveServicesToFreePorts(appDir: string) {
  const composePath = join(appDir, "docker-compose.yml");
  const envPath = join(appDir, ".env");
  let compose = readFileSync(composePath, "utf8");
  let env = readFileSync(envPath, "utf8");

  for (const [, hostPort] of [...compose.matchAll(/^\s+- "127\.0\.0\.1:(\d+):\d+"$/gm)]) {
    const port = await freePort();
    compose = compose.replace(`"127.0.0.1:${hostPort}:`, `"127.0.0.1:${port}:`);
    env = env.replace(new RegExp(`localhost:${hostPort}(?!\\d)`, "g"), `localhost:${port}`);
  }

  writeFileSync(composePath, compose);
  writeFileSync(envPath, env);
}

function envLines(text: string) {
  return text.split("\n").filter((line) => line && !line.startsWith("NUXT_AUTH_SECRET="));
}

describe("create-nuxvel, installed and run", () => {
  it("scaffolds an app that installs, boots and passes npm test and test:e2e out of the box, generated tests included", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "nuxvel-create-"));
    const appDir = join(scratchDir, "nuxvel-create-test-app");
    const composeEnv = { ...process.env, COMPOSE_PROJECT_NAME: `nuxvel-create-test-${randomUUID().slice(0, 8)}` };

    try {
      const created = await run("node", [createEntry, appDir, "--local"], scratchDir);
      expect(created.exitCode, created.output).toBe(0);
      const { vendorDir, nuxt, cli } = await packNuxvel(scratchDir);
      rmSync(join(appDir, ".npmrc"));
      const manifestPath = join(appDir, "package.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      manifest.dependencies["@nuxvel/nuxt"] = `file:${join(vendorDir, nuxt)}`;
      manifest.devDependencies["@nuxvel/cli"] = `file:${join(vendorDir, cli)}`;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      for (const file of [
        "Dockerfile",
        ".dockerignore",
        ".gitignore",
        ".github/workflows/ci.yml",
        "server/database/migrations/0000_init.sql",
        "server/privacy/users.user-data.ts",
        "server/privacy/flag-exposures.user-data.ts",
        "server/privacy/flag-conversions.user-data.ts",
      ]) {
        expect(existsSync(join(appDir, file)), file).toBe(true);
      }

      const env = readFileSync(join(appDir, ".env"), "utf8");
      expect(env).toMatch(/^NUXT_AUTH_SECRET=[\w-]{43}$/m);
      expect(envLines(env)).toEqual(envLines(readFileSync(repoEnvExample, "utf8")));

      const compose = await run("docker", ["compose", "config", "--format", "json"], appDir, composeEnv);
      expect(compose.exitCode, compose.output).toBe(0);
      const config = JSON.parse(compose.output) as {
        services: Record<string, unknown>;
        volumes: Record<string, unknown>;
      };
      expect(Object.keys(config.services).sort()).toEqual([
        "mailpit",
        "postgres",
        "redis",
        "seaweedfs",
      ]);
      expect(Object.keys(config.volumes).sort()).toEqual(["pgdata", "redisdata", "seaweedfsdata"]);

      // the machine running the release check may already use the template's ports for its own dev services
      await moveServicesToFreePorts(appDir);

      const installed = await run("npm", ["install", "--no-audit", "--no-fund"], appDir);
      expect(installed.exitCode, installed.output).toBe(0);

      const nuxvel = join(appDir, "node_modules", ".bin", "nuxvel");

      const generated = await run(nuxvel, ["make:job", "welcome.send"], appDir);
      expect(generated.exitCode, generated.output).toBe(0);
      expect(readFileSync(join(appDir, "server/jobs/welcome/send.job.test.ts"), "utf8")).toContain(
        'import { expect, runJob } from "@nuxvel/nuxt/testing";',
      );

      const resource = await run(
        nuxvel,
        ["make:resource", "project", "--soft-deletes", "--searchable", "name", "--ui"],
        appDir,
      );
      expect(resource.exitCode, resource.output).toBe(0);
      for (const file of ["app/pages/project/index.vue", "app/pages/project/new.vue", "app/components/ProjectForm.vue"]) {
        expect(existsSync(join(appDir, file)), file).toBe(true);
      }
      const migration = await run(nuxvel, ["db:generate"], appDir);
      expect(migration.exitCode, migration.output).toBe(0);

      mkdirSync(join(appDir, "app/components"), { recursive: true });
      writeFileSync(
        join(appDir, "app/components/AutoImportedTypes.vue"),
        '<script setup lang="ts">\ndefineProps<{ input: RouterInputs; output: RouterOutputs; updates?: LiveQueryUpdates<unknown, never>; optimistic?: OptimisticUpdate<unknown, unknown>; form?: ActionFormOptions<never, unknown> }>();\n</script>\n\n<template><div /></template>\n',
      );
      const typechecked = await run("npm", ["run", "typecheck"], appDir);
      expect(typechecked.exitCode, typechecked.output).toBe(0);
      mkdirSync(join(appDir, "tests/e2e"), { recursive: true });
      writeFileSync(
        join(appDir, "tests/e2e/unknown-route.test.ts"),
        'import { visit } from "@nuxvel/nuxt/testing";\n\nawait visit({ name: "no-such" });\n',
      );
      const unknownRoute = await run("npm", ["run", "typecheck"], appDir);
      expect(unknownRoute.exitCode, unknownRoute.output).not.toBe(0);
      expect(unknownRoute.output).toContain("no-such");
      rmSync(join(appDir, "tests/e2e/unknown-route.test.ts"));
      const archChecked = await run("npm", ["run", "test:arch"], appDir);
      expect(archChecked.exitCode, archChecked.output).toBe(0);

      const storybookBuilt = await run("npm", ["run", "storybook:build"], appDir, { ...process.env, STORYBOOK_DISABLE_TELEMETRY: "1" });
      expect(storybookBuilt.exitCode, storybookBuilt.output).toBe(0);
      const stories = JSON.parse(readFileSync(join(appDir, "storybook-static/index.json"), "utf8")) as { entries: Record<string, unknown> };
      expect(Object.keys(stories.entries)).toContain("nuxvel-datetime--relative");

      const tested = await run("npm", ["test"], appDir, composeEnv);
      expect(tested.exitCode, tested.output).toBe(0);
      const summary = tested.output.replace(/\u001b\[[0-9;]*m/g, "");
      expect([...summary.matchAll(/Test Files\s+(\d+) passed/g)].map((match) => match[1])).toEqual(["4", "2"]);
      expect([...summary.matchAll(/Tests\s+(\d+) passed/g)].map((match) => match[1])).toEqual(["12", "4"]);
      expect(summary.match(/◇ (Built the app for tests|Using the test build from)/g)).toHaveLength(1);

      const browserTested = await run("npm", ["run", "test:e2e"], appDir, composeEnv);
      expect(browserTested.exitCode, browserTested.output).toBe(0);
      expect(browserTested.output.replace(/\u001b\[[0-9;]*m/g, "")).toMatch(/Tests\s+4 passed/);

      const servicesUp = await run(nuxvel, ["services", "up"], appDir, composeEnv);
      expect(servicesUp.exitCode, servicesUp.output).toBe(0);

      const userId = randomUUID();
      const erased = await run(nuxvel, ["user:erase", userId, "--force"], appDir, {
        ...process.env,
        NUXT_DATABASE_URL: testDatabaseUrl(readFileSync(join(appDir, ".env"), "utf8")),
      });
      expect(erased.exitCode, erased.output).toBe(0);
      expect(erased.output).toContain(
        `Erased user ${userId}: api_keys 0, flag_conversions 0, flag_exposures 0, notifications 0, project 0, push_subscriptions 0, user 0`,
      );

      const checked = await run(nuxvel, ["db:check"], appDir, {
        ...process.env,
        NUXT_DATABASE_URL: testDatabaseUrl(readFileSync(join(appDir, ".env"), "utf8")),
      });
      expect(checked.exitCode, checked.output).toBe(0);
      expect(checked.output).toContain("Every foreign key has an index");
    } finally {
      await run("docker", ["compose", "down", "-v"], appDir, composeEnv);
      rmSync(scratchDir, { recursive: true, force: true });
    }
  }, 900000);
});
