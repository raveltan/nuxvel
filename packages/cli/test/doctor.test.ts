import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, describe, expect, it, vi } from "vitest";
import { scratchDatabase } from "./helpers/database.ts";
import { startFakeDns } from "./helpers/fake-dns.ts";
import { startStubApp } from "./helpers/fixtures.ts";
import { runCliWithEnv, stripAnsi } from "./helpers/run.ts";
import { scratchDir, scratchPlayground, sharedPlayground } from "./helpers/scratch.ts";
import { emptyWorkerRedis } from "./helpers/services.ts";
import { migrate } from "@nuxvel/test-helpers/cli";
import { scratchSql } from "@nuxvel/test-helpers/sql";

interface DoctorJson {
  checks: Array<{ name: string; status: string; findings: Array<{ status: string; detail: string; hint?: string }> }>;
  summary: { failed: number; warning: number; passed: number; skipped: number };
}

const fakeNpmBins: string[] = [];

afterAll(() => {
  for (const bin of fakeNpmBins) rmSync(bin, { recursive: true, force: true });
});

function fakeNpm(auditReport: object) {
  const bin = mkdtempSync(join(tmpdir(), "nuxvel-test-fake-npm-"));

  fakeNpmBins.push(bin);
  writeFileSync(join(bin, "audit.json"), JSON.stringify(auditReport));
  writeFileSync(join(bin, "npm"), `#!/bin/sh\ncat "${join(bin, "audit.json")}"\nexit 1\n`);
  chmodSync(join(bin, "npm"), 0o755);

  return `${bin}${delimiter}${process.env.PATH}`;
}

const cleanAudit = { metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } } };

vi.stubEnv("PATH", fakeNpm(cleanAudit));
afterAll(() => vi.unstubAllEnvs());

const fakeDns = await startFakeDns({
  "nuxvel.test": ["v=spf1 include:_spf.example.net ~all"],
  "default._domainkey.nuxvel.test": ["v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEB"],
  "_dmarc.nuxvel.test": ["v=DMARC1; p=quarantine"],
  "no-dmarc.test": ["v=spf1 -all"],
  "resend._domainkey.no-dmarc.test": ["v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEB"],
});

for (const [name, value] of Object.entries(fakeDns.env)) vi.stubEnv(name, value);
afterAll(fakeDns.close);

const CHECK_NAMES = [
  "environment",
  "database connection",
  "pending migrations",
  "stored names",
  "maintenance",
  "cache redis",
  "bot protection",
  "security advisories",
  "mail dns",
  "off-site backups",
  "restore rehearsal",
  "security headers",
  "health endpoints",
  "server-sent events",
];

function statuses(report: DoctorJson) {
  return Object.fromEntries(report.checks.map((check) => [check.name, check.status]));
}

describe("nuxvel doctor", () => {
  const playground = sharedPlayground("doctor");

  it("doctor --help names the maintenance, bot protection and restore rehearsal checks", async () => {
    const help = await runCliWithEnv(process.cwd(), process.env, "doctor", "--help");
    expect(help.exitCode).toBe(0);
    for (const check of ["maintenance mode", "bot protection", "off-site backups and restore rehearsals"]) expect(help.stdout).toContain(check);
  });

  it("doctor shows a row per check, with a hint under each missing env var, and a summary", async () => {
    const fixtureCwd = scratchDir("doctor-missing");
    const env = { ...process.env };
    delete env.NUXT_DATABASE_URL;
    delete env.NUXT_AUTH_SECRET;

    const { stdout, stderr, exitCode } = await runCliWithEnv(fixtureCwd, env, "doctor");
    const report = stripAnsi(stderr);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(report).toContain("┌  nuxvel doctor");
    expect(report).toContain("│  ✖ environment          NUXT_DATABASE_URL is not set");
    expect(report).toContain("→ Set it to the app's Postgres URL");
    expect(report).toContain("NUXT_AUTH_SECRET is not set");
    expect(report).toContain("→ Run nuxvel key:generate");
    expect(report).toContain("│  ○ database connection  skipped, NUXT_DATABASE_URL is not set");
    expect(report).toContain("│  ○ security headers     skipped, pass --url");
    expect(report).toContain("│  ○ health endpoints     skipped, pass --url");
    expect(report).toContain("└  1 failed, 1 passed, 12 skipped");

    const json = await runCliWithEnv(fixtureCwd, env, "doctor", "--json");
    const parsed: DoctorJson = JSON.parse(json.stdout);

    expect(json.exitCode).toBe(1);
    expect(json.stderr).toBe("");
    expect(parsed.checks.map((check) => check.name)).toEqual(CHECK_NAMES);
    expect(statuses(parsed)).toMatchObject({ environment: "failed", "security headers": "skipped" });
    expect(parsed.checks[0]?.findings).toContainEqual({
      status: "failed",
      detail: "NUXT_AUTH_SECRET is not set",
      hint: "Run nuxvel key:generate to write one of the right strength",
    });
    expect(parsed.summary).toEqual({ failed: 1, warning: 0, passed: 1, skipped: 12 });
  });

  it("doctor reads .env and checks the auth secret the way the server does at boot", async () => {
    const fixtureCwd = scratchDir("doctor-env");
    const env = { ...process.env };
    delete env.NUXT_AUTH_SECRET;

    const runDoctor = async () => stripAnsi((await runCliWithEnv(fixtureCwd, env, "doctor")).stderr);

    const generated = await runCliWithEnv(fixtureCwd, env, "key:generate");

    expect(generated.exitCode, generated.output).toBe(0);

    expect(await runDoctor()).not.toContain("NUXT_AUTH_SECRET");

    writeFileSync(join(fixtureCwd, ".env"), "NUXT_AUTH_SECRET=0123456789\n");

    expect(await runDoctor()).toContain(
      "NUXT_AUTH_SECRET: Too small: expected string to have >=32 characters",
    );
  });

  it("doctor names the missing credentials of each social provider that nuxvel.auth.social turns on", async () => {
    const appDir = scratchPlayground("doctor-social");
    const config = join(appDir, "nuxt.config.ts");

    writeFileSync(
      config,
      readFileSync(config, "utf8").replace("auth: { signInPath: '/sign-in',", "auth: { signInPath: '/sign-in', social: { github: true },"),
    );

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: "postgres://nuxvel:nuxvel@localhost:5432/unused",
      NUXT_AUTH_SECRET: "doctor-test-secret-of-at-least-32-characters",
    };
    const environmentRow = async (extra: Record<string, string>) => {
      const { stdout } = await runCliWithEnv(appDir, { ...env, ...extra }, "doctor", "--json");
      const parsed: DoctorJson = JSON.parse(stdout);

      return parsed.checks.find((check) => check.name === "environment");
    };

    expect(await environmentRow({})).toEqual({
      name: "environment",
      status: "failed",
      findings: [
        {
          status: "failed",
          detail: "NUXT_AUTH_GITHUB_CLIENT_ID is not set",
          hint: "Copy it from the OAuth app you registered with the provider",
        },
        {
          status: "failed",
          detail: "NUXT_AUTH_GITHUB_CLIENT_SECRET is not set",
          hint: "Copy it from the OAuth app you registered with the provider",
        },
      ],
    });
    expect(
      await environmentRow({ NUXT_AUTH_GITHUB_CLIENT_ID: "github-id", NUXT_AUTH_GITHUB_CLIENT_SECRET: "github-secret" }),
    ).toMatchObject({ status: "passed" });
  }, 90000);

  it("doctor checks the Stripe keys when nuxvel.billing is on, as the server does at boot", async () => {
    const env = {
      ...process.env,
      NUXT_DATABASE_URL: "postgres://nuxvel:nuxvel@localhost:5432/unused",
      NUXT_AUTH_SECRET: "doctor-test-secret-of-at-least-32-characters",
      NUXT_STRIPE_SECRET_KEY: "",
      NUXT_STRIPE_WEBHOOK_SECRET: "",
    };
    const environmentRow = async (extra: Record<string, string>) => {
      const { stdout } = await runCliWithEnv(playground, { ...env, ...extra }, "doctor", "--json");
      const parsed: DoctorJson = JSON.parse(stdout);

      return parsed.checks.find((check) => check.name === "environment")?.findings.map(({ detail }) => detail);
    };

    expect(await environmentRow({ NUXT_STRIPE_SECRET_KEY: "sk_live_doctor" })).toEqual([
      "NUXT_STRIPE_SECRET_KEY: A live key outside production",
    ]);
    expect(await environmentRow({ NODE_ENV: "production" })).toEqual(
      expect.arrayContaining(["NUXT_STRIPE_SECRET_KEY is not set", "NUXT_STRIPE_WEBHOOK_SECRET is not set"]),
    );
    expect(await environmentRow({ NUXT_STRIPE_SECRET_KEY: "sk_test_doctor" })).toEqual(["passes the server's boot checks"]);
  }, 90000);

  it("doctor warns in production when the cache and the queue share one Redis instance", async () => {
    const fixtureCwd = scratchDir("doctor-redis-cache");
    const env = { ...process.env, NODE_ENV: "production", NUXT_REDIS_URL: "redis://redis:6379/0" };
    const cacheRow = async (extra: Record<string, string>) => {
      const { stdout } = await runCliWithEnv(fixtureCwd, { ...env, ...extra }, "doctor", "--json");
      const parsed: DoctorJson = JSON.parse(stdout);

      return parsed.checks.find((check) => check.name === "cache redis");
    };

    expect(await cacheRow({ NUXT_REDIS_CACHE_URL: "redis://redis:6379/1" })).toEqual({
      name: "cache redis",
      status: "warning",
      findings: [
        {
          status: "warning",
          detail: "the cache and the queue share one Redis instance",
          hint: "Set NUXT_REDIS_CACHE_URL to a separate Redis, so evicted cache keys never take queued jobs with them",
        },
      ],
    });
    expect(await cacheRow({ NUXT_REDIS_CACHE_URL: "redis://cache:6379" })).toMatchObject({
      status: "passed",
      findings: [{ detail: "the cache has its own Redis, cache:6379" }],
    });
  });

  it("doctor warns in production when sign-up has no Turnstile captcha", async () => {
    const fixtureCwd = scratchDir("doctor-bot-protection");
    const env = { ...process.env, NODE_ENV: "production" };
    const botRow = async (extra: Record<string, string>) => {
      const { stdout } = await runCliWithEnv(fixtureCwd, { ...env, ...extra }, "doctor", "--json");
      const parsed: DoctorJson = JSON.parse(stdout);

      return parsed.checks.find((check) => check.name === "bot protection");
    };

    expect(await botRow({ NUXT_AUTH_TURNSTILE_SECRET_KEY: "" })).toEqual({
      name: "bot protection",
      status: "warning",
      findings: [
        {
          status: "warning",
          detail: "sign-up is open without a captcha",
          hint: "Set NUXT_AUTH_TURNSTILE_SECRET_KEY to a Cloudflare Turnstile secret key, so bots cannot sign up in bulk",
        },
      ],
    });
    expect(await botRow({ NUXT_AUTH_TURNSTILE_SECRET_KEY: "0x4AAAAAAA" })).toMatchObject({
      status: "passed",
      findings: [{ detail: "Turnstile guards sign-up and password reset" }],
    });
  });

  it("doctor sums up npm audit as a warning, and skips it when npm audit has no report", async () => {
    const fixtureCwd = scratchDir("doctor-advisories");
    const advisoriesRow = async (auditReport: object) => {
      const { stdout } = await runCliWithEnv(fixtureCwd, { ...process.env, PATH: fakeNpm(auditReport) }, "doctor", "--json");
      const parsed: DoctorJson = JSON.parse(stdout);

      return parsed.checks.find((check) => check.name === "security advisories");
    };

    expect(
      await advisoriesRow({
        vulnerabilities: { nuxt: {}, h3: {} },
        metadata: { vulnerabilities: { info: 0, low: 0, moderate: 1, high: 1, critical: 0, total: 2 } },
      }),
    ).toEqual({
      name: "security advisories",
      status: "warning",
      findings: [
        {
          status: "warning",
          detail: "2 vulnerable packages (1 high, 1 moderate), nuxt among them",
          hint: "Run npm audit for the advisories, and npm audit fix to update",
        },
      ],
    });
    expect(await advisoriesRow({ error: { code: "ENOTFOUND", summary: "request to registry failed" } })).toMatchObject({
      status: "skipped",
      findings: [{ detail: "skipped, npm audit failed: request to registry failed" }],
    });
  });

  it("doctor warns when the domain of nuxvel.mail.from has no DMARC record", async () => {
    const fixtureCwd = scratchDir("doctor-mail-dns");

    writeFileSync(
      join(fixtureCwd, "nuxt.config.ts"),
      'export default { nuxvel: { mail: { from: "Blog <hello@no-dmarc.test>" } } };\n',
    );

    const { stdout } = await runCliWithEnv(fixtureCwd, process.env, "doctor", "--json");
    const parsed: DoctorJson = JSON.parse(stdout);

    expect(parsed.checks.find((check) => check.name === "mail dns")).toEqual({
      name: "mail dns",
      status: "warning",
      findings: [
        {
          status: "warning",
          detail: "_dmarc.no-dmarc.test has no DMARC record",
          hint: "Add the TXT record that your mail provider gives you",
        },
      ],
    });
  });

  it("doctor warns for each environment of nuxvel.deploy.ts without an off-site backup target", async () => {
    const fixtureCwd = scratchDir("doctor-offsite");
    const server = { host: "203.0.113.10", user: "deploy", roles: ["web"] };
    const offsite = { endpoint: "https://s3.example.com", bucket: "backups", accessKeyId: "key", secretAccessKey: "secret" };
    const writeConfig = (environments: object) =>
      writeFileSync(
        join(fixtureCwd, "nuxvel.deploy.ts"),
        `import { defineDeploy } from "@nuxvel/cli/deploy";\n\nexport default defineDeploy({ app: "tasks", environments: ${JSON.stringify(environments)} });\n`,
      );
    const environment = { servers: [server], arch: "amd64", domains: ["tasks.example.com"] };
    const offsiteRow = async () => {
      const { stdout } = await runCliWithEnv(fixtureCwd, process.env, "doctor", "--json");
      return (JSON.parse(stdout) as DoctorJson).checks.find((check) => check.name === "off-site backups");
    };

    writeConfig({ production: { ...environment, backups: { offsite } }, staging: { ...environment, servers: [{ ...server, host: "203.0.113.20" }] } });
    expect(await offsiteRow()).toEqual({
      name: "off-site backups",
      status: "warning",
      findings: [
        {
          status: "warning",
          detail: "staging has no off-site backup target, its backups stay on its server",
          hint: "Set backups.offsite of staging in nuxvel.deploy.ts",
        },
      ],
    });

    writeConfig({ production: { ...environment, backups: { offsite } } });
    expect((await offsiteRow())?.findings).toEqual([{ status: "passed", detail: "every environment uploads its backups off-site" }]);
  });

  it("doctor warns when the restore of an environment with off-site backups was not rehearsed in 90 days", async () => {
    const fixtureCwd = scratchDir("doctor-rehearsal");
    const server = { host: "203.0.113.10", user: "deploy", roles: ["web"] };
    const offsite = { endpoint: "https://s3.example.com", bucket: "backups", accessKeyId: "key", secretAccessKey: "secret" };
    const environment = { servers: [server], arch: "amd64", domains: ["tasks.example.com"] };
    writeFileSync(
      join(fixtureCwd, "nuxvel.deploy.ts"),
      `import { defineDeploy } from "@nuxvel/cli/deploy";\n\nexport default defineDeploy({ app: "tasks", environments: ${JSON.stringify({ production: { ...environment, backups: { offsite } }, staging: { ...environment, servers: [{ ...server, host: "203.0.113.20" }] } })} });\n`,
    );
    const rehearsed = (daysAgo: number) =>
      writeFileSync(
        join(fixtureCwd, ".nuxvel", "rehearsals.json"),
        JSON.stringify({
          production: { time: new Date(Date.now() - daysAgo * 86_400_000).toISOString(), on: "staging", backup: "20260927T020312Z", minutes: 4.2, steps: [] },
        }),
      );
    const rehearsalRow = async () => {
      const { stdout } = await runCliWithEnv(fixtureCwd, process.env, "doctor", "--json");
      return (JSON.parse(stdout) as DoctorJson).checks.find((check) => check.name === "restore rehearsal");
    };
    const hint = "Run nuxvel server:restore staging --from=production:latest, and commit .nuxvel/rehearsals.json";

    expect((await rehearsalRow())?.findings).toEqual([{ status: "warning", detail: "the restore of production was never rehearsed", hint }]);

    mkdirSync(join(fixtureCwd, ".nuxvel"), { recursive: true });
    rehearsed(120);
    expect((await rehearsalRow())?.findings).toEqual([
      { status: "warning", detail: "the restore of production was last rehearsed 120 days ago, more than 90", hint },
    ]);

    rehearsed(10);
    expect((await rehearsalRow())?.findings).toEqual([
      { status: "passed", detail: "the restore of production was rehearsed 10 days ago on staging, in 4.2 min" },
    ]);
  });

  it("doctor checks the environment and the database of an app that sets runtimeConfig.databaseUrl in nuxt.config.ts", async () => {
    const fixtureCwd = scratchDir("doctor-runtime-config");
    const databaseUrl = await scratchDatabase("doctor-runtime-config");
    const { NUXT_DATABASE_URL: _url, ...rest } = process.env;
    const env = { ...rest, NUXT_AUTH_SECRET: "doctor-test-secret-of-at-least-32-characters" };

    writeFileSync(
      join(fixtureCwd, "nuxt.config.ts"),
      `export default { runtimeConfig: { databaseUrl: ${JSON.stringify(databaseUrl)} } };\n`,
    );
    mkdirSync(join(fixtureCwd, "server/database/migrations/meta"), { recursive: true });
    writeFileSync(join(fixtureCwd, "server/database/migrations/meta/_journal.json"), '{ "entries": [] }\n');

    const { stdout } = await runCliWithEnv(fixtureCwd, env, "doctor", "--json");
    const parsed: DoctorJson = JSON.parse(stdout);
    const check = (name: string) => parsed.checks.find((candidate) => candidate.name === name);

    expect(check("environment")).toEqual({
      name: "environment",
      status: "passed",
      findings: [{ status: "passed", detail: "passes the server's boot checks" }],
    });
    expect(check("database connection")).toEqual({
      name: "database connection",
      status: "passed",
      findings: [{ status: "passed", detail: `${new URL(databaseUrl).host}${new URL(databaseUrl).pathname}` }],
    });
    expect(check("pending migrations")).toMatchObject({ status: "passed", findings: [{ detail: "none pending" }] });
  }, 30000);

  it("doctor passes every check against a fully healthy env, and says so in --json", async () => {
    const appDir = playground;
    const databaseUrl = await scratchDatabase("doctor");

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: await emptyWorkerRedis(),
      NUXT_AUTH_SECRET: "doctor-test-secret-of-at-least-32-characters",
    };

    await migrate(appDir, env);

    const { stdout, stderr, exitCode } = await runCliWithEnv(appDir, env, "doctor");
    const report = stripAnsi(stderr);

    expect(exitCode, report).toBe(0);
    expect(stdout).toBe("");
    expect(report).toContain("✔ environment          passes the server's boot checks");
    expect(report).toContain(`✔ database connection  ${new URL(databaseUrl).host}${new URL(databaseUrl).pathname}`);
    expect(report).toContain("✔ pending migrations   none pending");
    expect(report).toContain("✔ stored names         nothing stored under an undefined name");
    expect(report).toContain("✔ maintenance          the app is up");
    expect(report).toContain("✔ mail dns             nuxvel.test has SPF, DKIM (selector default) and DMARC records");
    expect(report).toContain("└  7 passed, 7 skipped");

    const json = await runCliWithEnv(appDir, env, "doctor", "--json");
    const parsed: DoctorJson = JSON.parse(json.stdout);

    expect(json.exitCode, json.stderr).toBe(0);
    expect(statuses(parsed)).toEqual({
      environment: "passed",
      "database connection": "passed",
      "pending migrations": "passed",
      "stored names": "passed",
      maintenance: "passed",
      "cache redis": "skipped",
      "bot protection": "skipped",
      "security advisories": "passed",
      "mail dns": "passed",
      "off-site backups": "skipped",
      "restore rehearsal": "skipped",
      "security headers": "skipped",
      "health endpoints": "skipped",
      "server-sent events": "skipped",
    });
  }, 90000);

  it("doctor names what is stored under a name nothing defines, and not what a renamed() alias still answers to", async () => {
    const appDir = scratchPlayground("doctor-orphans");
    const databaseUrl = await scratchDatabase("doctor-orphans");
    const redisUrl = await emptyWorkerRedis();

    writeFileSync(
      join(appDir, "server/flags/rollout-before-move.ts"),
      'import { probeRolloutFlag } from "./probe-rollout.flag";\n\nexport default renamed(probeRolloutFlag);\n',
    );

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: redisUrl,
      NUXT_AUTH_SECRET: "doctor-test-secret-of-at-least-32-characters",
    };
    const queue = new Queue("nuxvel", { connection: { url: redisUrl, maxRetriesPerRequest: null } });
    const redis = new Redis(redisUrl);
    const sql = scratchSql(databaseUrl);

    try {
      await migrate(appDir, env);
      await queue.add("post.gone", { version: 1, payload: {} });
      await queue.add("post.gone", { version: 1, payload: {} });
      await queue.add("_probe.record", { version: 1, payload: { name: "known" } });
      await queue.upsertJobScheduler("posts.old-digest", { pattern: "0 3 * * *" }, { name: "posts.old-digest" });
      await redis.set("nuxvel:flags:rollout-before-move", JSON.stringify({ percentage: 10 }));
      await redis.set("nuxvel:flags:old-checkout", JSON.stringify({ percentage: 10 }));
      await redis.set("nuxvel:experiments:old-cta", JSON.stringify({ running: false, variants: {}, startedAt: "" }));
      await sql`insert into outbox (job_name, payload) values ('listener:gone', ${sql.json({ version: 1, payload: {} })})`;

      const { stderr, exitCode } = await runCliWithEnv(appDir, env, "doctor");
      const report = stripAnsi(stderr);

      expect(exitCode, report).toBe(1);
      expect(report).toContain('✖ stored names         queued job "post.gone" (2) is stored under a name nothing defines');
      expect(report).toContain('outbox row "listener:gone" is stored under a name nothing defines');
      expect(report).toContain('scheduler "posts.old-digest" is stored under a name nothing defines');
      expect(report).toContain('flag state "old-checkout" is stored under a name nothing defines');
      expect(report).toContain('experiment state "old-cta" is stored under a name nothing defines');
      expect(report).toContain("→ Keep a renamed() alias at the old path, or remove it");
      expect(report).not.toContain("_probe.record");
      expect(report).not.toContain("rollout-before-move");
    } finally {
      await queue.close();
      redis.disconnect();
    }
  }, 60000);

  it("doctor flags a missing CSP header or an unreachable health route, and passes when both are present", async () => {
    const appDir = playground;
    const databaseUrl = await scratchDatabase("doctor-url");

    const env = {
      ...process.env,
      NUXT_DATABASE_URL: databaseUrl,
      NUXT_REDIS_URL: await emptyWorkerRedis(),
      NUXT_AUTH_SECRET: "doctor-test-secret-of-at-least-32-characters",
    };

    const unhealthy = await startStubApp({ csp: false, healthStatus: 503, sse: "buffered" });
    const healthy = await startStubApp({ csp: true, healthStatus: 200, sse: "streamed" });

    try {
      await migrate(appDir, env);

      const flagged = await runCliWithEnv(appDir, env, "doctor", "--url", unhealthy.url);
      const flaggedReport = stripAnsi(flagged.stderr);

      expect(flagged.exitCode).toBe(1);
      expect(flaggedReport).toContain("✖ security headers");
      expect(flaggedReport).toContain("no Content-Security-Policy header");
      expect(flaggedReport).toContain("/api/health/live returned 503");
      expect(flaggedReport).toContain("/api/health/ready returned 503");
      expect(flaggedReport).toContain(`✖ server-sent events   no event from ${unhealthy.url}/api/channels/flags arrived within 5 s`);
      expect(flaggedReport).toContain("→ A proxy buffers the stream: turn buffering off for /api/channels (proxy_buffering off in nginx)");
      expect(flaggedReport).toContain("└  3 failed, 7 passed, 4 skipped");

      const clean = await runCliWithEnv(appDir, env, "doctor", "--url", healthy.url, "--json");
      const parsed: DoctorJson = JSON.parse(clean.stdout);

      expect(clean.exitCode, clean.stderr).toBe(0);
      expect(parsed.summary).toEqual({ failed: 0, warning: 0, passed: 10, skipped: 4 });
    } finally {
      await unhealthy.close();
      await healthy.close();
    }
  }, 90000);
});
