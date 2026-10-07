import { createRequire } from "node:module";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { tmpdir } from "node:os";

const require_ = createRequire(join(process.cwd(), "noop.js"));
const helpers = require_("@nuxvel/test-helpers/services");
const postgres = require_("postgres");
const { TEST_ADMIN_DATABASE_URL, TEST_REDIS_URL, TEST_MAIL_URL, TEST_STORAGE_URL } = helpers;

const scratchDb = "nuxvel_baseline_scratch";
const scratchUrl = TEST_ADMIN_DATABASE_URL.replace(/\/[^/?]*$/, `/${scratchDb}`);
const cliEntry = resolve("packages/cli/bin/nuxvel.mjs");

const admin = postgres(TEST_ADMIN_DATABASE_URL, { max: 1 });
await admin.unsafe(`DROP DATABASE IF EXISTS ${scratchDb} WITH (FORCE)`);
await admin.unsafe(`CREATE DATABASE ${scratchDb}`);
await admin.end();

const playgroundDir = resolve("playground");
const temp = mkdtempSync(join(resolve("."), ".nuxvel-test-baseline-"));
const nuxtTestBuilds = join(playgroundDir, ".nuxt", "test");
const playgroundOutputs = new Set([".output", ".nuxvel", ".data", ".env", ".nuxtrc", "node_modules"]);
cpSync(playgroundDir, temp, {
  recursive: true,
  filter: (source) => source === playgroundDir || !(playgroundOutputs.has(source.split("/").pop()) || source === nuxtTestBuilds),
});
symlinkSync(resolve("node_modules"), join(temp, "node_modules"), "dir");

const env = {
  ...process.env,
  NUXT_AUTH_SECRET: "seed-test-secret-seed-test-secret-seed",
  NUXT_DATABASE_URL: scratchUrl,
  NUXT_REDIS_URL: TEST_REDIS_URL,
  NUXT_MAIL_URL: TEST_MAIL_URL,
  NUXT_STORAGE_URL: TEST_STORAGE_URL,
};
delete env.NUXT_DATABASE_TEST_URL;
delete env.NUXT_REDIS_TEST_URL;
delete env.NUXT_MAIL_TEST_URL;
delete env.NUXT_STORAGE_TEST_URL;
delete env.NUXT_MAILPIT_TEST_URL;
delete env.CLAUDECODE;
delete env.CLAUDE_CODE_CHILD_SESSION;

function run(command) {
  return new Promise((resolve) => {
    const start = performance.now();
    const child = spawn("node", [cliEntry, ...command], {
      cwd: temp,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    child.stdout.on("data", () => {});
    child.on("exit", (code) => {
      resolve({ code, ms: Math.round(performance.now() - start), stderr: stderr.slice(-400) });
    });
  });
}

const stub = readFileSync("packages/nuxt/dist/module.mjs", "utf8").slice(0, 40);
const migrate = await run(["db:migrate"]);
const cold = await run(["db:seed"]);
const warm = await run(["db:seed"]);

console.log(
  JSON.stringify(
    {
      stub: stub.startsWith("import { createJiti }"),
      temp,
      scratchDb,
      migrate,
      cold,
      warm,
    },
    null,
    2,
  ),
);

console.log(`KEEP scratch database: ${scratchDb}`);

rmSync(temp, { recursive: true, force: true });
