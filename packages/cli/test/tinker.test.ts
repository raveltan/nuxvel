import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { scratchDatabase } from "./helpers/database.ts";
import { execFileAsync, runBinAt, runCliWithInput, runCliWithEnv, stripAnsi } from "./helpers/run.ts";
import { directorySnapshot, scratchPlayground, sharedPlayground } from "./helpers/scratch.ts";
import { migrate, startCli } from "@nuxvel/test-helpers/cli";
import { TEST_MAIL_URL, TEST_REDIS_URL, TEST_STORAGE_URL } from "@nuxvel/test-helpers/services";
import { scratchSql } from "@nuxvel/test-helpers/sql";

const bootEnv = {
  ...process.env,
  NUXT_DATABASE_URL: "postgres://nuxvel:nuxvel@localhost:5432/unused",
  NUXT_AUTH_SECRET: "tinker-test-secret-tinker-test-secret",
};

describe("nuxvel tinker", () => {
  const playground = sharedPlayground("tinker");

  it("tinker runs scripted REPL lines that create rows through an action and a factory", async () => {
    const appDir = playground;
    const databaseUrl = await scratchDatabase("tinker");

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_AUTH_SECRET: "tinker-test-secret-tinker-test-secret",
    };

    await migrate(appDir, env);

    const { stdout, exitCode } = await runCliWithInput(
      appDir,
      [
        'await useDb().insert(userTable).values({ id: "tinker-user", name: "Tinker", email: "tinker@example.com" });',
        'const post = await createPostAction({ title: "Tinkered", body: "From the REPL" }, { actor: userActor({ id: "tinker-user", role: "user" }) });',
        'console.log("created", post.title);',
        'console.log("factoried", (await postFactory({ title: "Factoried", authorId: "tinker-user" })).title);',
        'console.log("realtime globals", typeof $channels.posts.broadcast, typeof defineChannel, typeof holdStream);',
        'const [check] = await useDb().insert(healthChecksTable).values({ name: "probe", userId: "tinker-user" }).returning();',
        'const owned = await updateHealthCheckAction({ id: check.id, name: "owned" }, { actor: userActor({ id: "tinker-user", role: "user" }) });',
        'const denied = await updateHealthCheckAction({ id: check.id, name: "denied" }, { actor: userActor({ id: "other", role: "user" }) }).catch((error) => error.code);',
        'console.log("user probe", owned.name, denied);',
        "",
      ].join("\n"),
      env,
      "tinker",
    );

    expect(exitCode, stdout).toBe(0);
    expect(stdout).toContain("created Tinkered");
    expect(stdout).toContain("factoried Factoried");
    expect(stdout).toContain("realtime globals function function undefined");
    expect(stdout).toContain("user probe owned FORBIDDEN");

    const sql = scratchSql(databaseUrl);
    const rows = await sql<{ title: string }[]>`select title from posts order by title`;

    expect(rows.map((row) => row.title)).toEqual(["Factoried", "Tinkered"]);
  }, 60000);

  it("tinker runs multi-line statements and top-level await one after another, with the app in scope, and leaves the app's .nuxt alone", async () => {
    const appDir = playground;
    const types = directorySnapshot(join(appDir, ".nuxt"));

    const { stdout, exitCode } = await runCliWithInput(
      appDir,
      [
        "const answer = await new Promise((resolve) => setTimeout(() => resolve(21), 50)).then((n) => n * 2);",
        "function describe(value) {",
        "  return `answer ${value}, useDb is a ${typeof useDb}`;",
        "}",
        "console.log(describe(answer));",
        "",
      ].join("\n"),
      bootEnv,
      "tinker",
    );

    expect(exitCode, stdout).toBe(0);
    expect(stdout).toContain("answer 42, useDb is a function");
    expect(directorySnapshot(join(appDir, ".nuxt"))).toEqual(types);
  }, 60000);

  it("tinker completes the tRPC caller, factories and auto-imports on Tab, lists tables, routes and jobs, prints results deeply, and keeps a history file", async () => {
    const appDir = playground;
    const history = join(appDir, ".nuxvel", "tinker-history");
    rmSync(history, { force: true });

    const tinker = startCli(appDir, ["tinker"], { env: bootEnv, stdin: "pipe" });
    const exited = new Promise((resolve) => tinker.child.on("exit", resolve));
    const send = async (text: string, shown: string) => {
      tinker.child.stdin?.write(text);
      await tinker.waitForOutput(shown);
    };

    await send("", "nuxvel> ");
    for (const [typed, completed] of [
      ["console.log('completed', typeof trpc.post.withA", "trpc.post.withAuthors"],
      [", typeof postFact", "postFactory"],
      [", typeof systemAct", "systemActor"],
    ] as const) {
      await send(typed, typed);
      await send("\t", completed);
    }
    await send(")\n", "completed function function function");
    tinker.child.stdin?.end(".tables\n.routes\n.jobs\n({ post: { author: { profile: { city: 'Oslo' } } } })\n");

    expect(await exited).toBe(0);
    const lines = stripAnsi(tinker.output()).split(/\r?\n/).map((line) => line.replace(/\u001b\[\d*[GJ]|nuxvel> /g, "").trimEnd());
    expect(lines).toEqual(expect.arrayContaining(["postsTable                 posts", "healthChecksTable          health_checks"]));
    expect(lines).toEqual(expect.arrayContaining(["query     trpc.post.list", "mutation  trpc.post.create", "GET       /api/flags"]));
    expect(lines).toEqual(expect.arrayContaining(["post.notify-followers", "nuxvel.mail"]));
    expect(tinker.output()).toContain("{ post: { author: { profile: { city: 'Oslo' } } } }");
    expect(readFileSync(history, "utf8").split("\n").slice(0, 4)).toEqual([
      "({ post: { author: { profile: { city: 'Oslo' } } } })",
      ".jobs",
      ".routes",
      ".tables",
    ]);
  }, 120000);

  it("nuxt build writes .output/server/nuxvel/tinker.mjs, a REPL on the production server of the app, and leaves the server free of it", async () => {
    const appDir = scratchPlayground("tinker-release");
    const databaseUrl = await scratchDatabase("tinker-release");
    const env = {
      ...bootEnv,
      NODE_ENV: "production",
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: TEST_REDIS_URL,
      NUXT_SITE_URL: "https://tinker.example.com",
      NUXT_AUDIT_CHAIN_SECRET: "tinker-test-audit-chain-secret-0000000000",
      NUXT_MAIL_URL: TEST_MAIL_URL,
      NUXT_STORAGE_URL: TEST_STORAGE_URL,
      NUXT_STORAGE_BUCKET: "tinker-release",
      NUXT_STRIPE_SECRET_KEY: "sk_test_tinker",
      NUXT_STRIPE_WEBHOOK_SECRET: "whsec_tinker-test",
    };

    await migrate(appDir, { ...process.env, NUXT_DATABASE_URL: databaseUrl });
    const { TEST: _test, VITEST: _vitest, ...buildEnv } = process.env;
    const built = await runBinAt(appDir, "nuxt", ["build"], { ...buildEnv, NODE_ENV: "production" });
    expect(built.exitCode, built.stdout + built.stderr).toBe(0);

    const entry = join(appDir, ".output", "server", "nuxvel", "tinker.mjs");
    const index = readFileSync(join(appDir, ".output", "server", "index.mjs"), "utf8");
    expect(index).not.toMatch(/tinker/i);

    const port3000 = createServer();
    await new Promise<void>((resolve) => port3000.once("error", () => resolve()).listen(3000, () => resolve()));
    onTestFinished(() => void port3000.close());

    const tinker = spawn("node", [entry], { cwd: appDir, env, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    tinker.stdout.on("data", (chunk) => (output += String(chunk)));
    tinker.stderr.on("data", (chunk) => (output += String(chunk)));
    tinker.stdin.end(
      [
        'await useDb().insert(userTable).values({ id: "release-user", name: "Release", email: "release@example.com" });',
        'console.log("tinkered", (await useDb().select().from(userTable)).length, typeof createPostAction, typeof postFactory);',
        "",
      ].join("\n"),
    );

    expect(await new Promise((resolve) => tinker.on("exit", resolve)), output).toBe(0);
    expect(output).toContain("tinkered 1 function function");
    expect(output).not.toContain("EADDRINUSE");

    const statusFile = join(appDir, "maintenance-status.json");
    const command = async (json: object) => {
      const { stderr } = await execFileAsync("node", [entry, JSON.stringify(json)], { cwd: appDir, env });
      return stderr;
    };
    const status = async () => {
      await command({ kind: "maintenance:status", outFile: statusFile });
      return JSON.parse(readFileSync(statusFile, "utf8"));
    };

    expect(await command({ kind: "down", message: "Back soon", allow: [], keepQueue: true })).toContain(
      "The app is down for maintenance, the queue keeps running",
    );
    expect(await status()).toMatchObject({ down: true, message: "Back soon", queuePaused: false });
    expect(await command({ kind: "up" })).toContain("The app is up, the queue runs again");
    expect(await status()).toEqual({ down: false, queuePaused: false });
  }, 300000);

  it("tinker and task:run run inside the app's Nitro: a server/utils helper using useDb() and ~~/, and NUXT_* runtime config", async () => {
    const appDir = scratchPlayground("tinker-nitro");
    const databaseUrl = await scratchDatabase("tinker-nitro");
    const env = { ...bootEnv, NUXT_DATABASE_URL: databaseUrl, NUXT_PUBLIC_SIGN_IN_PATH: "/from-env" };

    writeFileSync(
      join(appDir, "server/utils/count-health-checks.ts"),
      [
        'import { healthChecksTable } from "~~/server/database/schema/health-check.schema";',
        "",
        "export async function countHealthChecks() {",
        "  return (await useDb().select().from(healthChecksTable)).length;",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(appDir, "server/tasks/count-health-checks.ts"),
      [
        "export default defineTask({",
        '  meta: { name: "count-health-checks" },',
        "  run: async () => ({ result: { count: await countHealthChecks(), signInPath: useRuntimeConfig().public.signInPath } }),",
        "});",
        "",
      ].join("\n"),
    );

    await migrate(appDir, env);

    const tinker = await runCliWithInput(
      appDir,
      'console.log("counted", await countHealthChecks(), useRuntimeConfig().public.signInPath);\n',
      env,
      "tinker",
    );

    expect(tinker.exitCode, tinker.output).toBe(0);
    expect(tinker.stdout).toContain("counted 0 /from-env");

    const task = await runCliWithEnv(appDir, env, "task:run", "count-health-checks");

    expect(task.exitCode, task.stderr).toBe(0);
    expect(task.stdout).toBe('{"count":0,"signInPath":"/from-env"}\n');
    expect(stripAnsi(task.stderr)).toContain("✔ count-health-checks finished");
  }, 60000);

  it("tinker reaches the database set in runtimeConfig, with no NUXT_DATABASE_URL in the environment", async () => {
    const appDir = scratchPlayground("tinker-runtime-config");
    const databaseUrl = await scratchDatabase("tinker-runtime-config");
    const config = join(appDir, "nuxt.config.ts");
    const { NUXT_DATABASE_URL: _url, ...env } = bootEnv;

    await migrate(appDir, { ...env, NUXT_DATABASE_URL: databaseUrl });
    writeFileSync(
      config,
      readFileSync(config, "utf8").replace(
        "compatibilityDate: '2025-07-15',",
        `compatibilityDate: '2025-07-15',\n  runtimeConfig: { databaseUrl: ${JSON.stringify(databaseUrl)} },`,
      ),
    );

    const { stdout, exitCode } = await runCliWithInput(
      appDir,
      'console.log("rows", (await useDb().select().from(healthChecksTable)).length);\n',
      env,
      "tinker",
    );

    expect(exitCode, stdout).toBe(0);
    expect(stdout).toContain("rows 0");
  }, 120000);

  it("tinker loads the app from a custom buildDir, and writes to neither that buildDir nor .nuxt", async () => {
    const appDir = scratchPlayground("tinker-build-dir");
    const tsconfig = join(appDir, "tsconfig.json");

    writeFileSync(tsconfig, readFileSync(tsconfig, "utf8").replaceAll("./.nuxt/", "./.nuxt-custom/"));
    renameSync(join(appDir, ".nuxt"), join(appDir, ".nuxt-custom"));
    const types = directorySnapshot(join(appDir, ".nuxt-custom"));

    const { stdout, exitCode } = await runCliWithInput(
      appDir,
      'console.log("schema tables", typeof postsTable, typeof useDb);\n',
      { ...bootEnv, PLAYGROUND_BUILD_DIR: ".nuxt-custom" },
      "tinker",
    );

    expect(exitCode, stdout).toBe(0);
    expect(stdout).toContain("schema tables object function");
    expect(existsSync(join(appDir, ".nuxt"))).toBe(false);
    expect(directorySnapshot(join(appDir, ".nuxt-custom"))).toEqual(types);
  }, 120000);

  it("tinker in an app whose tsconfig.json points at unwritten types says to run nuxt prepare", async () => {
    const appDir = scratchPlayground("tinker-unprepared");

    rmSync(join(appDir, ".nuxt"), { recursive: true });

    const { stdout, stderr, exitCode } = await runCliWithEnv(appDir, bootEnv, "tinker");

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stripAnsi(stderr)).toContain("→ Run nuxt prepare in the app: its tsconfig.json points at types that are not written yet");
    expect(existsSync(join(appDir, ".nuxt"))).toBe(false);
  }, 120000);

  it("tinker without a database URL fails fast naming it, with a hint, before any build", async () => {
    const appDir = scratchPlayground("tinker-no-database");
    const { NUXT_DATABASE_URL: _url, ...env } = bootEnv;
    const cacheDir = join(appDir, "node_modules", ".cache", "nuxvel", "server");
    const appBuilds = () =>
      (existsSync(cacheDir) ? readdirSync(cacheDir) : []).filter((name) => {
        const root = join(cacheDir, name, "root");
        return existsSync(root) && readFileSync(root, "utf8") === appDir;
      });

    const startedAt = performance.now();
    const { stdout, stderr, exitCode } = await runCliWithEnv(appDir, env, "tinker");
    const took = performance.now() - startedAt;

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stripAnsi(stderr).split("\n")).toEqual([
      "✖ NUXT_DATABASE_URL is not set",
      "  → Set it to the app's Postgres URL, e.g. postgres://app:secret@db:5432/app",
      "",
    ]);
    expect(took).toBeLessThan(3000);
    expect(appBuilds()).toEqual([]);
  });
});
