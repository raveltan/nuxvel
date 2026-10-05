import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { describe, expect, it } from "vitest";
import { deployConfigSchema } from "../src/deploy/define-deploy.ts";
import { sharedEnvProblems } from "../src/deploy/shared-env-problems.ts";
import { loadDeployConfig } from "../src/deploy/load-deploy-config.ts";
import { planColor } from "../src/deploy/plan-color.ts";
import { poolSize } from "../src/deploy/pool-size.ts";
import { processCounts } from "../src/deploy/process-counts.ts";
import { offsiteEnv } from "../src/server/offsite-env.ts";
import { clearEnvAfterTest, server, writeDeployConfig } from "./helpers/deploy-config.ts";
import { cliDir } from "./helpers/run.ts";
import { scratchDir } from "./helpers/scratch.ts";

describe("nuxvel.deploy.ts", () => {
  it("fills in the defaults of the optional settings", async () => {
    const dir = scratchDir("deploy-config");

    writeDeployConfig(dir, JSON.stringify({ servers: [server], arch: "amd64", domains: ["tasks.example.com"] }));
    writeFileSync(join(dir, ".nvmrc"), "24\n");

    expect(await loadDeployConfig(dir)).toEqual({
      app: "tasks",
      environments: {
        production: {
          servers: [server],
          arch: "amd64",
          domains: ["tasks.example.com"],
          redirects: {},
          processes: { web: "auto", worker: "auto" },
          deploy: { strategy: "blue-green", hold: 600, smoke: ["/"] },
          keepReleases: 5,
        },
      },
    });
  });

  it("loads every setting, with redirects between domains and paths", async () => {
    const dir = scratchDir("deploy-config");
    const production = {
      servers: [server],
      arch: "arm64",
      domains: ["tasks.example.com"],
      redirects: {
        "www.tasks.example.com": "tasks.example.com",
        "/old-pricing": "/pricing",
        "tasks.example.com/blog": "blog.example.com/tasks",
      },
      filesDomain: "files.tasks.example.com",
      processes: { web: 2, worker: 1 },
      deploy: { strategy: "rolling", hold: 300, smoke: ["/", "/sign-in"] },
      alerts: {
        email: "ops@example.com",
        smtp: "smtp://alerts:secret@smtp.example.com:587",
        webhook: "https://hooks.example.com/alerts",
        heartbeat: "https://hc-ping.com/5b1c0f6e",
      },
      logs: { sink: { type: "http", uri: "https://logs.example.com" } },
      keepReleases: 3,
    };

    writeDeployConfig(dir, JSON.stringify(production));

    expect(await loadDeployConfig(dir)).toEqual({ app: "tasks", environments: { production } });
  });

  it("reads credentials from .env.deploy, and the shell environment wins over it", async () => {
    const dir = scratchDir("deploy-config");

    clearEnvAfterTest("NUXVEL_TEST_OFFSITE_KEY_ID", "NUXVEL_TEST_OFFSITE_SECRET");
    process.env.NUXVEL_TEST_OFFSITE_KEY_ID = "key-from-ci";
    writeFileSync(
      join(dir, ".env.deploy"),
      "NUXVEL_TEST_OFFSITE_KEY_ID=key-from-file\nNUXVEL_TEST_OFFSITE_SECRET=secret-from-file\n",
    );
    writeDeployConfig(
      dir,
      `{
        servers: [${JSON.stringify(server)}],
        arch: "amd64",
        domains: ["tasks.example.com"],
        backups: {
          offsite: {
            endpoint: "https://s3.example.com",
            bucket: "tasks-backups",
            accessKeyId: process.env.NUXVEL_TEST_OFFSITE_KEY_ID,
            secretAccessKey: process.env.NUXVEL_TEST_OFFSITE_SECRET,
          },
        },
      }`,
    );

    const config = await loadDeployConfig(dir);

    expect(config.environments.production?.backups?.offsite).toMatchObject({
      accessKeyId: "key-from-ci",
      secretAccessKey: "secret-from-file",
    });
  });

  it("fails with each problem of a malformed file, and accepts one server only", async () => {
    const dir = scratchDir("deploy-config");

    writeDeployConfig(
      dir,
      JSON.stringify({
        servers: [server, { ...server, user: "root" }],
        arch: "x86",
        domains: ["tasks.example.com"],
        redirects: { "not a path": "/pricing" },
        deploy: { hold: "10 minutes" },
        alerts: { email: "ops@example.com" },
        backups: { offsite: { endpoint: "https://s3.example.com", bucket: "tasks-backups" } },
      }),
    );

    const loading = loadDeployConfig(dir);

    await expect(loading).rejects.toThrow("nuxvel.deploy.ts is invalid");
    await expect(loading).rejects.toThrow(/must list exactly one server\s+→ at environments\.production\.servers/);
    await expect(loading).rejects.toThrow(/must not be root.*\s+→ at environments\.production\.servers\[1\]\.user/);
    await expect(loading).rejects.toThrow(/→ at environments\.production\.arch/);
    await expect(loading).rejects.toThrow(/must be a domain, a path like \/old/);
    await expect(loading).rejects.toThrow(/→ at environments\.production\.deploy\.hold/);
    await expect(loading).rejects.toThrow(/sends email through an SMTP relay: set smtp\s+→ at environments\.production\.alerts\.smtp/);
    await expect(loading).rejects.toThrow(
      /is not set, add it to \.env\.deploy\s+→ at environments\.production\.backups\.offsite\.secretAccessKey/,
    );
  });

  it("fails when an alerts or logs.sink value reads a variable that is not set", async () => {
    const dir = scratchDir("deploy-config");

    writeDeployConfig(
      dir,
      `{
        servers: [${JSON.stringify(server)}],
        arch: "amd64",
        domains: ["tasks.example.com"],
        alerts: { webhook: process.env.NUXVEL_TEST_UNSET_WEBHOOK },
        logs: { sink: { type: "http", uri: "https://logs.example.com", auth: { password: process.env.NUXVEL_TEST_UNSET_PASSWORD } } },
      }`,
    );

    const loading = loadDeployConfig(dir);

    await expect(loading).rejects.toThrow(/is not set, add it to \.env\.deploy\s+→ at environments\.production\.alerts\.webhook/);
    await expect(loading).rejects.toThrow(/is not set, add it to \.env\.deploy\s+→ at environments\.production\.logs\.sink\.auth\.password/);
  });

  it("names NUXT_MAIL_URL when the shared env of a deploy does not set it", async () => {
    const base = [
      "NUXT_DATABASE_URL=postgres://localhost/tasks",
      `NUXT_AUTH_SECRET=${"a".repeat(32)}`,
      "NUXT_REDIS_URL=redis://localhost:6379",
      "NUXT_SITE_URL=https://tasks.example.com",
      `NUXT_AUDIT_CHAIN_SECRET=${"b".repeat(32)}`,
    ].join("\n");

    expect((await sharedEnvProblems(base)).map(({ variable }) => variable)).toEqual(["NUXT_MAIL_URL"]);
    expect(await sharedEnvProblems(`${base}\nNUXT_MAIL_URL=smtp://smtp.example.com:587`)).toEqual([]);
  });

  it("names the off-site endpoint and bucket that are not set", async () => {
    const dir = scratchDir("deploy-config");

    writeDeployConfig(
      dir,
      `{
        servers: [${JSON.stringify(server)}],
        arch: "amd64",
        domains: ["tasks.example.com"],
        backups: { offsite: { endpoint: process.env.NUXVEL_TEST_UNSET_ENDPOINT, bucket: process.env.NUXVEL_TEST_UNSET_BUCKET, accessKeyId: "key", secretAccessKey: "secret" } },
      }`,
    );

    const loading = loadDeployConfig(dir);

    await expect(loading).rejects.toThrow(/is not set, add it to \.env\.deploy\s+→ at environments\.production\.backups\.offsite\.endpoint/);
    await expect(loading).rejects.toThrow(/is not set, add it to \.env\.deploy\s+→ at environments\.production\.backups\.offsite\.bucket/);
  });

  it("refuses an app name that the server uses for its own users and databases, or for a rehearsal", () => {
    for (const app of ["default", "nuxvel", "postgres", "template0", "template1"]) {
      const result = deployConfigSchema.safeParse({
        app,
        environments: { production: { servers: [server], arch: "amd64", domains: ["tasks.example.com"] } },
      });
      expect(result.error?.issues).toEqual([expect.objectContaining({ path: ["app"], message: expect.stringContaining("must not be default, nuxvel") })]);
    }
    const rehearsal = deployConfigSchema.safeParse({
      app: "tasks-rehearsal",
      environments: { production: { servers: [server], arch: "amd64", domains: ["tasks.example.com"] } },
    });
    expect(rehearsal.error?.issues).toEqual([expect.objectContaining({ path: ["app"], message: expect.stringContaining("must not end with -rehearsal, server:restore --from=<env>:<time> uses that name") })]);
  });

  it("refuses an off-site value that /etc/nuxvel/offsite.env cannot hold", () => {
    const parsed = deployConfigSchema.safeParse({
      app: "tasks",
      environments: {
        production: {
          servers: [server],
          arch: "amd64",
          domains: ["tasks.example.com"],
          backups: { offsite: { endpoint: "https://s3.example.com", bucket: "tasks-backups", accessKeyId: "key", secretAccessKey: "it's\nsecret" } },
        },
      },
    });

    expect(parsed.error?.issues).toEqual([
      expect.objectContaining({
        path: ["environments", "production", "backups", "offsite", "secretAccessKey"],
        message: "contains a single quote or a line break, and /etc/nuxvel/offsite.env cannot hold it",
      }),
    ]);
  });

  it("writes the off-site env of a rehearsal so a secret with quotes, backslashes and $ reads back unchanged", () => {
    const secretAccessKey = 'a"b\\c$HOME`d#e';
    const env = offsiteEnv({ endpoint: "https://s3.example.com", bucket: "tasks-backups", accessKeyId: "key", secretAccessKey });

    expect(parseEnv(env)).toMatchObject({ RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY: secretAccessKey, NUXVEL_OFFSITE_BUCKET: "tasks-backups" });
  });

  it("refuses two environments that share an off-site bucket", () => {
    const environment = (bucket: string, host: string) => ({
      servers: [{ ...server, host }],
      arch: "amd64",
      domains: ["tasks.example.com"],
      backups: { offsite: { endpoint: "https://s3.example.com", bucket, accessKeyId: "key", secretAccessKey: "secret" } },
    });

    const shared = deployConfigSchema.safeParse({
      app: "tasks",
      environments: { production: environment("tasks-backups", "203.0.113.10"), staging: environment("tasks-backups", "203.0.113.20") },
    });
    expect(shared.error?.issues).toEqual([
      expect.objectContaining({
        path: ["environments", "staging", "backups", "offsite", "bucket"],
        message: "is also the off-site bucket of production, give each environment its own bucket",
      }),
    ]);

    const own = deployConfigSchema.safeParse({
      app: "tasks",
      environments: { production: environment("tasks-backups", "203.0.113.10"), staging: environment("tasks-staging-backups", "203.0.113.20") },
    });
    expect(own.success).toBe(true);
  });

  it("refuses two environments that share a host", () => {
    const environment = (host: string) => ({ servers: [{ ...server, host }], arch: "amd64", domains: ["tasks.example.com"] });

    const shared = deployConfigSchema.safeParse({
      app: "tasks",
      environments: { production: environment("203.0.113.10"), staging: environment("203.0.113.10") },
    });
    expect(shared.error?.issues).toEqual([
      expect.objectContaining({
        path: ["environments", "staging", "servers", 0, "host"],
        message: "is also the host of production, give each environment its own server",
      }),
    ]);

    const own = deployConfigSchema.safeParse({
      app: "tasks",
      environments: { production: environment("203.0.113.10"), staging: environment("203.0.113.20") },
    });
    expect(own.success).toBe(true);
  });

  it("fails when the file is missing", async () => {
    await expect(loadDeployConfig(scratchDir("deploy-config"))).rejects.toThrow("nuxvel.deploy.ts not found");
  });
});

describe("process counts", () => {
  it("sizes auto processes from the memory share of each app, keeping room for a second set of web processes", () => {
    const auto = { web: "auto", worker: "auto" } as const;

    expect(processCounts(auto, { appsMb: 2400, cpus: 2, apps: 1 })).toEqual({ web: 1, worker: 1 });
    expect(processCounts(auto, { appsMb: 11000, cpus: 4, apps: 1 })).toEqual({ web: 4, worker: 1 });
    expect(processCounts(auto, { appsMb: 11000, cpus: 16, apps: 1 })).toEqual({ web: 10, worker: 1 });
    expect(processCounts(auto, { appsMb: 5000, cpus: 4, apps: 2 })).toEqual({ web: 1, worker: 1 });
    expect(processCounts({ web: "auto", worker: 3 }, { appsMb: 11000, cpus: 16, apps: 1 })).toEqual({ web: 9, worker: 3 });
    expect(processCounts({ web: 3, worker: 0 }, { appsMb: 2400, cpus: 2, apps: 1 })).toEqual({ web: 3, worker: 0 });
    expect(() => processCounts({ web: 1, worker: 10 }, { appsMb: 2400, cpus: 2, apps: 1 })).toThrow(
      "processes.worker is 10, a color has ports for 9 workers",
    );
  });
});

describe("pool size", () => {
  it("splits the Postgres connections between every process on the server, both colors included", () => {
    expect(poolSize(100, [{ web: 1, worker: 1 }])).toBe(10);
    expect(poolSize(100, [{ web: 4, worker: 1 }])).toBe(9);
    expect(poolSize(100, [{ web: 4, worker: 1 }, { web: 2, worker: 2 }, { web: 1, worker: 1 }])).toBe(4);
    expect(poolSize(100, [{ web: 30, worker: 9 }])).toBe(1);
    expect(() => poolSize(100, [{ web: 40, worker: 9 }])).toThrow("98 processes do not fit in the 100 Postgres connections of the server");
  });
});

describe("deploy strategy", () => {
  const serverState = (appsMb: number) => ({
    registry: {
      node: "24.0.0",
      cpus: 4,
      memory: { appsMb },
      services: { postgres: { maxConnections: 100 } },
      apps: { tasks: { folder: "/srv/apps/tasks", ports: { blue: [3000, 3009] as [number, number], green: [3010, 3019] as [number, number] } } },
    },
    states: { tasks: { active: "blue" as const, releases: { blue: "r1", green: null }, contractMigrations: [] } },
    releases: ["r1"],
  });
  const environment = (processes: { web: number; worker: number }, strategy = "blue-green") => {
    const { production } = deployConfigSchema.parse({
      app: "tasks",
      environments: { production: { servers: [server], arch: "amd64", domains: ["tasks.example.com"], processes, deploy: { strategy } } },
    }).environments;
    if (!production) throw new Error("production is missing");
    return production;
  };

  it("deploys blue-green to the idle color, and rolling on the live color when set or when a second color does not fit", () => {
    expect(planColor("tasks", environment({ web: 2, worker: 1 }), serverState(4000))).toMatchObject({
      strategy: "blue-green",
      color: "green",
      port: 3010,
    });
    expect(planColor("tasks", environment({ web: 4, worker: 1 }), serverState(4000))).toMatchObject({
      strategy: "rolling",
      secondColorFits: false,
      color: "blue",
      port: 3000,
    });
    expect(planColor("tasks", environment({ web: 1, worker: 1 }, "rolling"), serverState(4000))).toMatchObject({
      strategy: "rolling",
      secondColorFits: true,
      color: "blue",
    });
  });
});

describe("restore helpers", () => {
  it("pass database URLs in the environment, not in the arguments of the commands they run", () => {
    const serverDir = join(cliDir, "src", "server");
    for (const helper of ["restore.cjs", "server-restore.cjs", "rehearsal.cjs"]) {
      const text = readFileSync(join(serverDir, "helpers", helper), "utf8");
      expect(text, helper).not.toMatch(/`NUXT_DATABASE_URL=\$\{/);
      expect(text, helper).not.toContain('"-d", target.url');
      expect(text, helper).not.toContain("[target.url]");
    }
    expect(readFileSync(join(serverDir, "backup-scripts", "restore.sh"), "utf8")).not.toContain("--to=");
  });
});

describe("app secrets", () => {
  it("the app script writes the audit chain and the Open Graph image secrets", () => {
    const script = readFileSync(join(cliDir, "src", "server", "app-scripts", "70-auth.sh"), "utf8");
    for (const name of ["NUXT_AUDIT_CHAIN_SECRET", "NUXT_OG_IMAGE_SECRET"]) {
      expect(script).toContain(`set_env ${name} "$(openssl rand -hex 32)"`);
    }
  });
});

describe("served assets", () => {
  it("come from a root-owned folder that the assets helper fills, never from the deploy user's folder", () => {
    const serverDir = join(cliDir, "src", "server");
    expect(readFileSync(join(serverDir, "scripts", "125-caddy-site.sh"), "utf8")).not.toContain("shared/assets");
    expect(readFileSync(join(serverDir, "deploy-scripts", "release.sh"), "utf8")).not.toMatch(/cp -R[^\n]*assets/);
  });
});

describe("server scripts", () => {
  it("keep passwords and keys out of the arguments of the commands they run", () => {
    const serverDir = join(cliDir, "src", "server");
    const scripts = readdirSync(serverDir, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".sh"))
      .map((file) => ({ file, text: readFileSync(join(serverDir, file), "utf8") }));

    for (const { file, text } of scripts) {
      expect(text, file).not.toMatch(/curl[^\n|]* --user /);
      expect(text, file).not.toMatch(/redis-cli[^\n|]* (-u|-a|--pass) /);
      expect(text, file).not.toMatch(/-c "[^"]*PASSWORD '/);
      expect(text, file).not.toMatch(/node [^\n]*\$NUXVEL_HOLD/);
      for (const line of text.split("\n").filter((line) => /> "[^"]*\.nuxvel-new"/.test(line))) {
        expect(line, file).toContain("umask 077");
      }
    }
    expect(readFileSync(join(serverDir, "deploy-scripts", "env-write.sh"), "utf8")).toContain("umask 077");
    expect(readFileSync(join(serverDir, "shell-script.ts"), "utf8")).toContain('(umask 077 && printf');
  });
});
