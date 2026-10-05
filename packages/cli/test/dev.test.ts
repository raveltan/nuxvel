import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { request } from "node:https";
import { join } from "node:path";
import { Queue } from "bullmq";
import { describe, expect, it, onTestFinished } from "vitest";
import { scratchDatabase } from "./helpers/database.ts";
import { writeFakeTool } from "./helpers/fixtures.ts";
import { execFileAsync, runCliWithEnv, stripAnsi } from "./helpers/run.ts";
import { playgroundDir, repoNodeModules, scratchDir, scratchPlayground } from "./helpers/scratch.ts";
import { migrate, startCli } from "@nuxvel/test-helpers/cli";
import { freePort } from "@nuxvel/test-helpers/free-port";
import { scratchSql } from "@nuxvel/test-helpers/sql";
import { emptyWorkerRedis, listening, waitFor } from "./helpers/services.ts";

const portlessCli = join(repoNodeModules, "portless", "dist", "cli.js");

function fakeNuxtProject(label: string, packageName: string) {
  const dir = scratchDir(label);

  writeFakeTool(dir, "nuxt", 'console.log(["nuxt", ...process.argv.slice(2)].join(" "));');
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: packageName }));

  return dir;
}

function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;

  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));

  child.kill("SIGTERM");

  return exited;
}

type ProxiedResponse = { status: number; cookies: string[]; body: string };

function proxiedRequest(
  app: URL,
  ca: Buffer,
  path: string,
  options: { method?: string; body?: unknown; cookie?: string; origin?: string } = {},
) {
  return new Promise<ProxiedResponse>((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port: app.port,
        servername: app.hostname,
        ca,
        path,
        method: options.method ?? "GET",
        headers: {
          host: app.host,
          origin: options.origin ?? app.origin,
          "content-type": "application/json",
          ...(options.cookie ? { cookie: options.cookie } : {}),
        },
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => (body += String(chunk)));
        response.on("end", () =>
          resolve({ status: response.statusCode ?? 0, cookies: response.headers["set-cookie"] ?? [], body }),
        );
      },
    );

    req.on("error", reject);
    req.end(options.body === undefined ? undefined : JSON.stringify(options.body));
  });
}

function outsideVitest(env: NodeJS.ProcessEnv) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !/^(NODE_ENV|TEST|VITEST.*)$/.test(name)));
}

function sessionCookie(cookies: string[]) {
  return cookies.find((cookie) => cookie.includes("session_token"))?.split(";")[0];
}

describe("nuxvel dev", () => {
  it("runs the project's nuxt dev through portless, named after package.json", async () => {
    const dir = fakeNuxtProject("dev-portless", "@acme/Shop_Web");

    const { stdout, stderr, exitCode } = await runCliWithEnv(
      dir,
      { ...process.env, PORTLESS: "0" },
      "dev",
      "--https",
      "--port",
      "4123",
    );

    expect(exitCode).toBe(0);
    expect(stripAnsi(stderr)).toContain("Starting nuxt dev through portless as shop-web");
    expect(stdout).toContain("nuxt dev --port 4123");
    expect(stdout).not.toContain("https://");
  });

  it("forwards --help to plain nuxt dev, starting nothing", async () => {
    const dir = fakeNuxtProject("dev-help", "shop");

    const { stdout, stderr, exitCode } = await runCliWithEnv(dir, { ...process.env, CI: "1" }, "dev", "--help");

    expect(exitCode, stderr).toBe(0);
    expect(stdout.trim()).toBe("nuxt dev --help");
    expect(stderr).toBe("");
  });

  it("falls back to plain nuxt dev under CI, with a warning, unless --https is passed", async () => {
    const dir = fakeNuxtProject("dev-ci", "shop");

    const { stdout, stderr, exitCode } = await runCliWithEnv(dir, { ...process.env, CI: "1" }, "dev", "--port", "4123");

    expect(exitCode, stderr).toBe(0);
    expect(stripAnsi(stderr)).toContain("▲ Not in an interactive terminal (or CI is set): running plain nuxt dev");
    expect(stripAnsi(stderr)).toContain("→ Pass --https to serve through portless anyway");
    expect(stripAnsi(stderr)).not.toContain("portless as");
    expect(stdout.trim()).toBe("nuxt dev --port 4123");
  });

  it("runs nuxt dev as a queue worker holding the Nuxt lock, unless --no-queue is passed", async () => {
    const dir = scratchDir("dev-queue-role");
    const env = { ...process.env, CI: "1", NUXVEL_ROLE: undefined, NUXT_LOCK: undefined };

    writeFakeTool(
      dir,
      "nuxt",
      'console.log(`role=${process.env.NUXVEL_ROLE ?? ""} lock=${process.env.NUXT_LOCK}`, ...process.argv.slice(2));',
    );
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "shop" }));

    const withQueue = await runCliWithEnv(dir, env, "dev", "--port", "4123");
    const withoutQueue = await runCliWithEnv(dir, env, "dev", "--no-queue", "--port", "4123");

    expect(withQueue.stdout.trim(), withQueue.stderr).toBe("role=worker lock=1 dev --port 4123");
    expect(withoutQueue.stdout.trim(), withoutQueue.stderr).toBe("role= lock=1 dev --port 4123");
  });

  it("sets NUXT_SITE_URL to the printed app URL unless the environment or .env sets it", async () => {
    const dir = scratchDir("dev-site-url");
    const env = { ...process.env, CI: "1", NUXT_SITE_URL: undefined };

    writeFakeTool(dir, "nuxt", "console.log(process.env.NUXT_SITE_URL ?? '');");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "shop" }));

    const fromDev = await runCliWithEnv(dir, env, "dev", "--no-https", "--port", "4123");
    const fromShell = await runCliWithEnv(dir, { ...env, NUXT_SITE_URL: "https://shell.example.com" }, "dev", "--port", "4123");
    writeFileSync(join(dir, ".env"), "NUXT_SITE_URL=https://file.example.com\n");
    const fromFile = await runCliWithEnv(dir, env, "dev", "--port", "4123");

    expect(fromDev.stdout.trim(), fromDev.stderr).toBe("http://localhost:4123");
    expect(fromShell.stdout.trim(), fromShell.stderr).toBe("https://shell.example.com");
    expect(fromFile.stdout.trim(), fromFile.stderr).toBe("https://file.example.com");
  });

  it("runs nuxt dev with source maps, keeping the caller's NODE_OPTIONS", async () => {
    const dir = scratchDir("dev-node-options");
    const env = { ...process.env, NODE_OPTIONS: "--max-old-space-size=4096" };

    writeFakeTool(dir, "nuxt", "console.log(process.env.NODE_OPTIONS);");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "shop" }));

    const plain = await runCliWithEnv(dir, { ...env, CI: "1" }, "dev", "--port", "4123");
    const proxied = await runCliWithEnv(dir, { ...env, PORTLESS: "0" }, "dev", "--https", "--port", "4123");

    for (const { stdout, stderr, exitCode } of [plain, proxied]) {
      expect(exitCode, stderr).toBe(0);
      expect(stdout.trim()).toBe("--max-old-space-size=4096 --enable-source-maps");
    }
  });

  it("prints the app and service URLs from the compose ports and .env before nuxt dev, and no sign-in from the seeder", async () => {
    const dir = fakeNuxtProject("dev-summary", "shop");
    const mailpitPort = await freePort();
    const composeDown = async () => {
      await execFileAsync("docker", ["compose", "down"], { cwd: dir }).catch(() => undefined);
    };
    const env = {
      ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(NUXT_.*|PORT)$/.test(name))),
      CI: "1",
    };

    writeFileSync(
      join(dir, "docker-compose.yml"),
      [
        `name: nuxvel-cli-dev-summary-${randomUUID().slice(0, 8)}`,
        "services:",
        "  mailpit:",
        "    image: axllent/mailpit",
        "    ports:",
        `      - "${mailpitPort}:8025"`,
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, ".env"),
      [
        "NUXT_DATABASE_URL=postgres://nuxvel:nuxvel@localhost:5432/shop",
        "NUXT_REDIS_URL=redis://localhost:6379",
        "NUXT_STORAGE_URL=http://nuxvel:nuxvel-secret@localhost:8333",
        "NUXT_STORAGE_BUCKET=shop",
        "",
      ].join("\n"),
    );
    mkdirSync(join(dir, "server", "seeders"), { recursive: true });
    cpSync(join(playgroundDir, "server", "seeders", "database.seeder.ts"), join(dir, "server", "seeders", "database.ts"));
    onTestFinished(composeDown);

    const withQueue = await runCliWithEnv(dir, env, "dev", "--port", "4123");
    const withoutQueue = await runCliWithEnv(dir, env, "dev", "--no-queue", "--port", "4123");

    expect(withQueue.exitCode, withQueue.stderr).toBe(0);
    expect(withQueue.stderr).not.toContain("\u001b[");
    expect(withQueue.stderr).toContain(
      [
        "",
        "  App       http://localhost:4123",
        "  DevTools  http://localhost:4123/__nuxt_devtools__/client/",
        "  Postgres  postgres://nuxvel:nuxvel@localhost:5432/shop",
        "  Redis     redis://localhost:6379",
        `  Mailpit   http://localhost:${mailpitPort}`,
        "  Storage   http://localhost:8333 (bucket shop)",
        "  Queue     runs inside the dev server",
        "",
      ].join("\n"),
    );
    expect(withQueue.stderr.indexOf("Started dev services")).toBeLessThan(withQueue.stderr.indexOf("  App"));
    expect(withoutQueue.stderr).toContain("  Queue     off (--no-queue)\n");
    expect(withQueue.stderr).not.toContain("API docs");
    expect(withQueue.stderr).not.toContain("Sign in");
  }, 120_000);

  it("creates the missing audit log partitions at startup, before the summary", async () => {
    const dir = fakeNuxtProject("dev-audit-partitions", "shop");
    const databaseUrl = await scratchDatabase("dev-audit-partitions");
    const sql = scratchSql(databaseUrl);

    await sql`create table audit_log (id bigint, occurred_at timestamptz not null) partition by range (occurred_at)`;

    const { stderr, exitCode } = await runCliWithEnv(
      dir,
      { ...process.env, CI: "1", NUXT_DATABASE_OWNER_URL: undefined, NUXT_DATABASE_URL: databaseUrl },
      "dev",
      "--port",
      "4123",
    );
    const output = stripAnsi(stderr);

    expect(exitCode, stderr).toBe(0);
    expect(output).toContain("◇  Audit log partitions: created 4, dropped 0");
    expect(output.indexOf("Audit log partitions")).toBeLessThan(output.indexOf("  App"));

    const partitions = await sql`select 1 from pg_inherits where inhparent = 'audit_log'::regclass`;

    expect(partitions).toHaveLength(4);
  });

  it("stops before nuxt dev while a migration is pending or a migration that ran was edited", async () => {
    const dir = fakeNuxtProject("dev-migrations", "shop");
    const migrationsDir = join(dir, "server", "database", "migrations");
    const migration = join(migrationsDir, "0000_init.sql");
    const env = { ...process.env, CI: "1", NUXT_DATABASE_OWNER_URL: undefined, NUXT_DATABASE_URL: await scratchDatabase("dev-migrations") };
    const dev = async () => {
      const { stdout, stderr, exitCode } = await runCliWithEnv(dir, env, "dev", "--port", "4123");
      return { stdout, exitCode, output: stripAnsi(stderr) };
    };

    mkdirSync(join(migrationsDir, "meta"), { recursive: true });
    writeFileSync(
      join(migrationsDir, "meta", "_journal.json"),
      JSON.stringify({ entries: [{ idx: 0, version: "7", when: 1790000000000, tag: "0000_init", breakpoints: true }] }),
    );
    writeFileSync(migration, "CREATE TABLE shop_items (id serial PRIMARY KEY);\n");

    const pending = await dev();

    expect(pending.exitCode).toBe(1);
    expect(pending.stdout).not.toContain("nuxt dev");
    expect(pending.output).toContain("✖ 1 pending migration: 0000_init");
    expect(pending.output).toContain("→ Run nuxvel db:migrate, then nuxvel dev again");

    await migrate(dir, env);
    writeFileSync(migration, "CREATE TABLE shop_products (id serial PRIMARY KEY);\n");

    const edited = await dev();

    expect(edited.exitCode).toBe(1);
    expect(edited.stdout).not.toContain("nuxt dev");
    expect(edited.output).toContain("✖ 0000_init changed after it ran on this database");

    writeFileSync(migration, "CREATE TABLE shop_items (id serial PRIMARY KEY);\n");

    const migrated = await dev();

    expect(migrated.exitCode, migrated.output).toBe(0);
    expect(migrated.stdout).toContain("nuxt dev --port 4123");
  });

  it("prints the API docs row when nuxvel.api.openapi is set", async () => {
    const dir = fakeNuxtProject("dev-summary-api-docs", "shop");
    writeFileSync(
      join(dir, "nuxt.config.ts"),
      'export default defineNuxtConfig({ nuxvel: { api: { restPrefix: "/api/rest", openapi: { title: "Shop", version: "1.0.0" } } } });\n',
    );

    const { stderr, exitCode } = await runCliWithEnv(dir, { ...process.env, CI: "1" }, "dev", "--port", "4123");

    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("  API docs  http://localhost:4123/api/rest/docs\n");
  });

  it("passes a free Storybook port to nuxt dev and prints http://localhost:<port> without portless", async () => {
    const dir = scratchDir("dev-storybook-plain");
    const env = { ...process.env, CI: "1" };
    const dev = () => runCliWithEnv(dir, env, "dev", "--port", "4123");

    writeFakeTool(dir, "nuxt", "console.log(`storybook port ${process.env.NUXVEL_STORYBOOK_PORT}`);");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "shop" }));

    const without = await dev();

    expect(without.stdout.trim(), without.stderr).toBe("storybook port undefined");
    expect(without.stderr).not.toContain("Storybook");

    mkdirSync(join(dir, ".storybook"));
    const withStorybook = await dev();
    const port = withStorybook.stdout.match(/storybook port (\d+)/)?.[1];

    expect(port, withStorybook.stderr).toBeDefined();
    expect(withStorybook.stderr).toContain(`  Storybook  http://localhost:${port}\n`);

    writeFileSync(join(dir, "nuxt.config.ts"), "export default defineNuxtConfig({ nuxvel: { storybook: false } });\n");
    const disabled = await dev();

    expect(disabled.stdout.trim(), disabled.stderr).toBe("storybook port undefined");
    expect(disabled.stderr).not.toContain("Storybook");
  });

  it("serves Storybook at https://storybook.<app>.localhost through portless and removes the route when dev stops", async () => {
    const dir = scratchDir("dev-storybook-portless");
    const stateDir = scratchDir("dev-storybook-portless-state");
    const routes = join(stateDir, "routes.json");
    const proxyPort = await freePort();
    const env = {
      ...process.env,
      PORTLESS_STATE_DIR: stateDir,
      PORTLESS_PORT: String(proxyPort),
      PORTLESS_SYNC_HOSTS: "0",
    };
    const storybookRoute = () => readFileSync(routes, "utf8").includes("storybook.shop.localhost");

    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "shop" }));
    mkdirSync(join(dir, ".storybook"));
    writeFakeTool(
      dir,
      "nuxt",
      [
        'import { readFileSync } from "node:fs";',
        'import { createServer } from "node:http";',
        'if (process.env.FAKE_NUXT_FAILS) {',
        '  console.log(readFileSync(`${process.env.PORTLESS_STATE_DIR}/routes.json`, "utf8"));',
        "  process.exit(1);",
        "}",
        'createServer((request, response) => response.end("storybook")).listen(Number(process.env.NUXVEL_STORYBOOK_PORT), "127.0.0.1");',
      ].join("\n"),
    );

    const proxy = spawn(
      process.execPath,
      [portlessCli, "proxy", "start", "--foreground", "--skip-trust", "-p", String(proxyPort)],
      { env, stdio: "ignore" },
    );
    onTestFinished(() => stop(proxy));
    const ca = await waitFor(async () => {
      try {
        return readFileSync(join(stateDir, "ca.pem"));
      } catch {
        return undefined;
      }
    });
    await waitFor(() => listening(proxyPort));

    const dev = startCli(dir, ["dev", "--https"], { env, group: true });
    onTestFinished(() => dev.stop());

    const storybook = new URL(`https://storybook.shop.localhost:${proxyPort}`);
    const page = await waitFor(async () => {
      const response = await proxiedRequest(storybook, ca, "/").catch(() => undefined);
      return response?.status === 200 ? response.body : undefined;
    }, 30_000).catch(() => {
      throw new Error(`Storybook never answered through portless:\n${dev.output()}`);
    });

    expect(page).toBe("storybook");
    expect(stripAnsi(dev.output())).toContain(`  Storybook  ${storybook.origin}\n`);

    await dev.stop("SIGINT");

    expect(storybookRoute(), dev.output()).toBe(false);

    const failed = await runCliWithEnv(dir, { ...env, FAKE_NUXT_FAILS: "1" }, "dev", "--https");

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toContain("storybook.shop.localhost");
    expect(storybookRoute(), failed.stderr).toBe(false);
  }, 60_000);

  it("keeps serving while a generator adds a file, and picks up the generated name", async () => {
    const appDir = scratchPlayground("dev-make");
    const port = await freePort();
    const env = {
      ...outsideVitest(process.env),
      CI: "1",
      NUXT_DATABASE_URL: await scratchDatabase("dev-make"),
      NUXT_REDIS_URL: await emptyWorkerRedis(),
      NUXT_AUTH_SECRET: "dev-make-secret-dev-make-secret-00000",
    };

    await migrate(appDir, env);

    const dev = startCli(appDir, ["dev", "--no-queue", "--port", String(port)], { env, group: true });
    onTestFinished(() => dev.stop());

    // a request that lands while the nitro worker reloads after the generated file never gets a response
    const status = (path: string) =>
      fetch(`http://localhost:${port}${path}`, { signal: AbortSignal.timeout(10_000) }).then(
        (response) => response.status,
        () => 0,
      );
    const home = () => status("/");
    const channel = () => status("/api/channels/tasks");

    await waitFor(async () => ((await home()) === 200 ? true : undefined), 180_000).catch(async () => {
      throw new Error(`the dev server never answered 200 (last ${await home()}):\n${dev.output()}`);
    });
    expect(await channel()).toBe(404);

    const generated = await runCliWithEnv(appDir, env, "make:channel", "tasks");

    expect(generated.exitCode, generated.stderr).toBe(0);
    expect(stripAnsi(generated.stderr)).toContain("○ Types update in the running nuxt dev (nuxt prepare skipped)");

    await waitFor(async () => ((await channel()) === 403 ? true : undefined), 60_000).catch(async () => {
      throw new Error(`the dev server did not serve the tasks channel (last ${await channel()}):\n${dev.output()}`);
    });
    const channels = join(appDir, ".nuxt", "nuxvel", "channels.ts");
    const listed = () =>
      readFile(channels, "utf8").then(
        (code) => code.includes(join(appDir, "server", "channels", "tasks.channel.ts")),
        () => false,
      );
    await waitFor(async () => (await listed()) || undefined, 30_000).catch(() => {
      throw new Error(`the dev server did not regenerate ${channels}:\n${dev.output()}`);
    });
    await waitFor(async () => ((await home()) === 200 ? true : undefined), 60_000).catch(async () => {
      throw new Error(`the dev server stopped answering 200 (last ${await home()}):\n${dev.output()}`);
    });
    expect(dev.output()).not.toContain(".nuxt/dist directory has been removed");
  }, 300_000);

  it("runs the queue worker inside nuxt dev, restarts it on a change, and stops it with the dev server", async () => {
    const appDir = scratchPlayground("dev-queue");
    const redisUrl = await emptyWorkerRedis();
    const port = await freePort();
    const env = {
      ...outsideVitest(process.env),
      CI: "1",
      NUXT_DATABASE_URL: await scratchDatabase("dev-queue"),
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "dev-queue-secret-dev-queue-secret-0000",
    };
    const queue = new Queue("nuxvel", { connection: { url: redisUrl, maxRetriesPerRequest: null } });
    onTestFinished(() => queue.close());

    await migrate(appDir, env);

    const dev = startCli(appDir, ["dev", "--port", String(port)], { env, group: true });
    onTestFinished(() => dev.stop());

    const answers = () => fetch(`http://localhost:${port}/api/health/live`).then((response) => response.ok, () => false);
    const workerStarts = () => stripAnsi(dev.output()).match(/worker listening on queue/g)?.length ?? 0;

    await waitFor(async () => ((await queue.getWorkers()).length > 0 && (await answers())) || undefined, 180_000).catch(
      async () => {
        throw new Error(`workers ${(await queue.getWorkers()).length}, answers ${await answers()}:\n${dev.output()}`);
      },
    );
    expect(workerStarts(), dev.output()).toBe(1);

    const job = join(appDir, "server", "jobs", "demo", "countdown.job.ts");
    writeFileSync(job, `${readFileSync(job, "utf8")}\nexport const touched = true;\n`);

    await waitFor(async () => (workerStarts() === 2 && (await queue.getWorkers()).length > 0) || undefined, 120_000).catch(
      () => {
        throw new Error(`the worker did not restart after the change:\n${dev.output()}`);
      },
    );

    await dev.stop();

    // nuxt dev exits on SIGTERM without Nitro's close hook, so Redis lists the worker until it sees the dead socket close
    await waitFor(async () => ((await queue.getWorkers()).length === 0 || undefined), 10_000);
    expect(await answers()).toBe(false);
  }, 300_000);

  it("shows the source file in the stack of a server error in nuxt dev", async () => {
    const appDir = scratchPlayground("dev-source-maps");
    const port = await freePort();
    const env = {
      ...outsideVitest(process.env),
      CI: "1",
      NUXT_DATABASE_URL: await scratchDatabase("dev-source-maps"),
      NUXT_REDIS_URL: await emptyWorkerRedis(),
      NUXT_AUTH_SECRET: "dev-queue-secret-dev-queue-secret-0000",
    };

    await migrate(appDir, env);
    writeFileSync(
      join(appDir, "server", "api", "mapped-boom.get.ts"),
      'export default defineEventHandler(() => {\n  throw new Error("mapped boom");\n});\n',
    );

    const dev = startCli(appDir, ["dev", "--no-queue", "--port", String(port)], { env, group: true });
    onTestFinished(() => dev.stop());

    await waitFor(
      () => fetch(`http://localhost:${port}/api/mapped-boom`).then((response) => response.status === 500 || undefined, () => undefined),
      180_000,
    ).catch(() => {
      throw new Error(`the failing route never answered 500:\n${dev.output()}`);
    });
    await dev.waitForOutput("mapped boom", 10_000);

    const logged = stripAnsi(dev.output());

    expect(logged).toContain("mapped-boom.get.ts");
    expect(logged).not.toMatch(/mapped boom[\s\S]*\.nuxt\/dev\/index\.mjs/);
  }, 300_000);

  it("keeps serving when the queue worker cannot start inside nuxt dev", async () => {
    const appDir = scratchPlayground("dev-queue-broken");
    const port = await freePort();
    const env = {
      ...outsideVitest(process.env),
      CI: "1",
      NUXT_DATABASE_URL: await scratchDatabase("dev-queue-broken"),
      NUXT_REDIS_URL: await emptyWorkerRedis(),
      NUXT_AUTH_SECRET: "dev-queue-secret-dev-queue-secret-0000",
    };

    await migrate(appDir, env);
    writeFileSync(
      join(appDir, "server", "jobs", "nightly.ts"),
      'import { z } from "zod";\n\nexport default defineJob({ input: z.object({}), handler: () => {} });\n',
    );
    writeFileSync(
      join(appDir, "server", "schedules", "nightly.ts"),
      "export default defineSchedule({ at: { hour: 3 }, handler: () => {} });\n",
    );

    const dev = startCli(appDir, ["dev", "--port", String(port)], { env, group: true });
    onTestFinished(() => dev.stop());

    await dev.waitForOutput("the worker could not start", 180_000);

    await waitFor(
      () => fetch(`http://localhost:${port}/api/health/live`).then((response) => response.ok || undefined, () => undefined),
      30_000,
    ).catch(() => {
      throw new Error(`the dev server stopped serving after the worker failed:\n${dev.output()}`);
    });
  }, 300_000);

  it(
    "signs a user in on the proxied https://<app>.localhost origin and serves Storybook at https://storybook.<app>.localhost",
    async () => {
      const appDir = scratchPlayground("dev-https");
      const stateDir = scratchDir("dev-https-portless");
      const proxyPort = await freePort();
      const env = {
        ...outsideVitest(process.env),
        PORTLESS_STATE_DIR: stateDir,
        PORTLESS_PORT: String(proxyPort),
        PORTLESS_SYNC_HOSTS: "0",
        NUXT_DATABASE_URL: await scratchDatabase("dev-https"),
        NUXT_REDIS_URL: await emptyWorkerRedis(),
        NUXT_AUTH_SECRET: "dev-https-secret-dev-https-secret-000",
      };
      const packageJson = join(appDir, "package.json");

      writeFileSync(
        packageJson,
        JSON.stringify({ ...JSON.parse(readFileSync(packageJson, "utf8")), name: "dev-https-app" }),
      );
      await migrate(appDir, env);

      const proxy = spawn(
        process.execPath,
        [portlessCli, "proxy", "start", "--foreground", "--skip-trust", "-p", String(proxyPort)],
        { env, stdio: "ignore" },
      );
      onTestFinished(() => stop(proxy));
      const ca = await waitFor(async () => {
        try {
          return readFileSync(join(stateDir, "ca.pem"));
        } catch {
          return undefined;
        }
      });
      await waitFor(() => listening(proxyPort));

      const dev = startCli(appDir, ["dev", "--https"], { env, group: true });
      onTestFinished(() => dev.stop());

      const origin = new URL(`https://dev-https-app.localhost:${proxyPort}`);

      await waitFor(async () => {
        const response = await proxiedRequest(origin, ca, "/api/health/live").catch(() => undefined);
        return response?.status === 200 ? true : undefined;
      }, 150_000).catch(() => {
        throw new Error(`the proxied dev server never answered:\n${dev.output()}`);
      });

      const credentials = { email: "proxied@example.com", password: "correct-horse-battery-staple" };
      const foreign = await proxiedRequest(origin, ca, "/api/auth/sign-up/email", {
        method: "POST",
        body: { name: "Foreign", ...credentials },
        origin: "https://evil.localhost",
      });
      expect(foreign.status, foreign.body).toBe(403);

      const signUp = await proxiedRequest(origin, ca, "/api/auth/sign-up/email", {
        method: "POST",
        body: { name: "Proxied", ...credentials },
      });
      expect(signUp.status, signUp.body).toBe(200);

      const signIn = await proxiedRequest(origin, ca, "/api/auth/sign-in/email", {
        method: "POST",
        body: credentials,
      });
      expect(signIn.status, signIn.body).toBe(200);

      const session = await proxiedRequest(origin, ca, "/api/auth/get-session", {
        cookie: sessionCookie(signIn.cookies),
      });
      expect(JSON.parse(session.body)).toMatchObject({ user: { email: credentials.email } });

      const mutation = await proxiedRequest(origin, ca, "/api/trpc/health.echo", {
        method: "POST",
        body: { json: "proxied" },
      });
      expect(mutation.status, mutation.body).toBe(200);

      await dev.waitForOutput("worker listening on queue");

      const storybook = new URL(`https://storybook.dev-https-app.localhost:${proxyPort}`);
      const iframe = await waitFor(async () => {
        const response = await proxiedRequest(storybook, ca, "/iframe.html").catch(() => undefined);
        return response?.status === 200 ? response.body : undefined;
      }, 120_000).catch(() => {
        throw new Error(`Storybook never answered through portless:\n${dev.output()}`);
      });
      expect(iframe).toContain("<title>Storybook</title>");
    },
    240_000,
  );
});
