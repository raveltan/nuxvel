import { createECDH } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Redis } from "ioredis";
import { describe, expect, it, onTestFinished } from "vitest";
import { bootEnv, buildNuxtFixture, buildServerFixture, composeStates, writeFakeTool, writeRedisCompose } from "./helpers/fixtures.ts";
import { cliDir, execFileAsync, runCli, runCliAt, runCliWithEnv, runCliWithInput, stripAnsi, tableRows } from "./helpers/run.ts";
import { nodeOnlyPath, outsideRepoDir, scratchDir, scratchPlayground } from "./helpers/scratch.ts";
import { startCli } from "@nuxvel/test-helpers/cli";
import { freePort } from "@nuxvel/test-helpers/free-port";
import { emptyWorkerRedis, listening, waitFor } from "./helpers/services.ts";
import pkg from "../package.json" with { type: "json" };

function violationLines(stderr: string) {
  return stripAnsi(stderr)
    .trimEnd()
    .split("\n")
    .filter((line) => !line.startsWith("▲"));
}

describe("nuxvel project commands", () => {
  it("--help exits 0 and lists every command under src/commands", async () => {
    const { stdout, exitCode } = await runCli("--help");
    const commandFiles = readdirSync(join(cliDir, "src", "commands"));
    const names = await Promise.all(
      commandFiles.map(async (file) => {
        const command: { default: { meta?: unknown } } = await import(join(cliDir, "src", "commands", file));
        const meta = command.default.meta;
        return typeof meta === "object" && meta !== null && "name" in meta ? meta.name : file;
      }),
    );
    const listed = [...stripAnsi(stdout).matchAll(/^ +(\S+) {2,}\S/gm)].map((match) => match[1]);

    expect(exitCode).toBe(0);
    expect(names.length).toBeGreaterThan(50);
    expect(listed.sort()).toEqual(names.sort());
  }, 30000);

  it("--help before a passthrough command, or after one of nuxvel's own, shows nuxvel's usage", async () => {
    const beforeTest = await runCli("--help", "test");
    const afterMake = await runCli("make:job", "-h");

    expect(beforeTest.exitCode).toBe(0);
    expect(stripAnsi(beforeTest.stdout)).toContain("nuxvel test");
    expect(afterMake.exitCode).toBe(0);
    expect(stripAnsi(afterMake.stdout)).toContain("nuxvel make:job");
  });

  it("--help shows a short USAGE line instead of every command name", async () => {
    const { stdout } = await runCli("--help");

    expect(stripAnsi(stdout)).toContain("USAGE nuxvel <command> [OPTIONS]");
    expect(stripAnsi(stdout)).not.toContain("dev|build");
  });

  it("bare nuxvel, nuxvel help and --help print the same grouped help, in the groups and order of docs/cli.md", async () => {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !["CI", "FORCE_COLOR"].includes(key)));
    const bare = await runCliWithEnv(cliDir, env);
    const helpWord = await runCli("help");
    const helpFlag = await runCli("--help");
    const docs = readFileSync(join(cliDir, "..", "..", "docs", "cli.md"), "utf8");
    const documented: [string, string[]][] = [];

    for (const line of docs.split("\n")) {
      if (line.startsWith("## ")) documented.push([line.slice(3), []]);
      const command = /^### `nuxvel ([^\s`]+)/.exec(line)?.[1];
      if (command !== undefined) documented.at(-1)?.[1].push(command);
    }

    const listed = stripAnsi(bare.stdout)
      .split("\n\n")
      .map((block) => block.split("\n"))
      .filter(([heading, ...rows]) => heading !== undefined && !heading.startsWith(" ") && rows.length > 0 && rows.every((row) => row.startsWith("  ")))
      .map(([heading, ...rows]): [string, string[]] => [heading ?? "", rows.map((row) => row.trim().split(/\s+/)[0] ?? "")]);

    expect(bare.exitCode).toBe(0);
    expect(bare.stdout).not.toContain("\x1b");
    expect(stripAnsi(bare.stdout)).toContain("USAGE nuxvel <command> [OPTIONS]");
    expect(stripAnsi(bare.stdout).trimEnd()).toMatch(/Run nuxvel <command> --help for the usage of one command\.$/);
    expect(listed).toEqual(documented.filter(([, commands]) => commands.length > 0));
    expect(stripAnsi(helpWord.stdout)).toBe(stripAnsi(bare.stdout));
    expect(stripAnsi(helpFlag.stdout)).toBe(stripAnsi(bare.stdout));
  });

  it("nuxvel help <command> shows that command's --help", async () => {
    const { stdout, exitCode } = await runCli("help", "make:job");

    expect(exitCode).toBe(0);
    expect(stripAnsi(stdout)).toContain("nuxvel make:job");
  });

  it("an unknown command exits 2, points at --help and lists the commands on stderr, with nothing on stdout", async () => {
    const { stdout, stderr, exitCode } = await runCli("nope");
    const lines = stripAnsi(stderr).split("\n");

    expect(exitCode).toBe(2);
    expect(stdout).toBe("");
    expect(lines.slice(0, 3)).toEqual(['✖ Unknown command "nope"', "  → Run nuxvel --help to list commands", ""]);
    expect(lines).toContain("Development");
  });

  it("an unknown command that is part of a command name gets a did-you-mean hint instead of --help", async () => {
    const { stderr, exitCode } = await runCli("migrate");

    expect(exitCode).toBe(2);
    expect(stripAnsi(stderr)).toContain("  → Did you mean nuxvel db:migrate?");
  });

  it("a missing argument exits 2 and points at the command's help", async () => {
    const { stdout, stderr, exitCode } = await runCli("make:job");

    expect(exitCode).toBe(2);
    expect(stdout).toBe("");
    expect(stripAnsi(stderr)).toContain("✖ Missing required positional argument: NAME");
    expect(stripAnsi(stderr)).toContain("→ Run nuxvel make:job --help for its usage");
  });

  it("an unexpected error prints one line, and its stack only under DEBUG=nuxvel", async () => {
    const fixtureCwd = scratchDir("unexpected-error");

    const plain = await runCliAt(fixtureCwd, "build", "--image=app:1");
    const debug = await runCliWithEnv(fixtureCwd, { ...process.env, DEBUG: "nuxvel" }, "build", "--image=app:1");

    expect(plain.exitCode).toBe(1);
    expect(stripAnsi(plain.stderr)).toContain("✖ No Dockerfile in");
    expect(stripAnsi(plain.stderr)).toContain("→ Run again with DEBUG=nuxvel for the stack");
    expect(plain.stderr).not.toMatch(/^\s+at /m);
    expect(debug.exitCode).toBe(1);
    expect(debug.stderr).toMatch(/^\s+at buildImage /m);
  });

  it("prints no escape codes under NO_COLOR", async () => {
    const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "1" };
    const help = await runCliWithEnv(cliDir, env, "--help");
    const unknown = await runCliWithEnv(cliDir, env, "nope");

    expect(help.stdout + help.stderr + unknown.stdout + unknown.stderr).not.toContain("\x1b");
  });

  it("--version exits 0 and prints the package version", async () => {
    const { stdout, exitCode } = await runCli("--version");

    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(pkg.version);
  });

  it("dev spawns nuxt dev and exits cleanly on kill", async () => {
    const appDir = scratchPlayground("dev");
    const port = await freePort();
    const dev = startCli(appDir, ["dev", "--no-https", "--port", String(port), "--host", "127.0.0.1"]);

    const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      dev.child.on("exit", (code, signal) => resolve({ code, signal }));
    });

    await waitFor(() => listening(port), 30000);
    await dev.stop();

    const { code, signal } = await exit;

    expect(code === 0 || signal === "SIGTERM").toBe(true);
  }, 60000);

  it("dev --no-https runs the project's plain nuxt dev with its extra arguments", async () => {
    const fixtureCwd = scratchDir("dev-args");

    writeFakeTool(fixtureCwd, "nuxt", 'console.log(["nuxt", ...process.argv.slice(2)].join(" "));');

    const { stdout, exitCode } = await runCliAt(fixtureCwd, "dev", "--no-https", "--port", "4123", "--host");

    expect(exitCode).toBe(0);
    expect(stdout).toContain("nuxt dev --port 4123 --host");
  });

  it("dev says so instead of crashing when nuxt is not installed", async () => {
    const fixtureCwd = outsideRepoDir("dev-no-nuxt");

    const { stderr, exitCode } = await runCliWithEnv(fixtureCwd, { PATH: `${nodeOnlyPath(fixtureCwd)}:/usr/bin:/bin` }, "dev", "--no-https");

    expect(stripAnsi(stderr)).toContain("✖ Could not run nuxt");
    expect(stripAnsi(stderr)).toContain("→ Install it in this project (npm i nuxt)");
    expect(exitCode).toBe(1);
  });

  it("dev starts the dev services before the dev server and stops them on Ctrl-C", async () => {
    const fixtureCwd = scratchDir("dev-services");
    const port = await freePort();
    const composeDown = async () => {
      await execFileAsync("docker", ["compose", "down", "-v"], { cwd: fixtureCwd }).catch(() => undefined);
    };

    writeRedisCompose(fixtureCwd, "dev-services", port);
    writeFakeTool(fixtureCwd, "nuxt", 'console.log("nuxt dev");\nsetInterval(() => {}, 1000);');
    await composeDown();
    onTestFinished(composeDown);

    const dev = startCli(fixtureCwd, ["dev", "--no-https"]);
    onTestFinished(() => dev.stop());

    await dev.waitForOutput("nuxt dev", 90000);
    expect(dev.output()).toContain("Started dev services");
    expect(await listening(port), dev.output()).toBe(true);

    await dev.stop("SIGINT");

    expect(stripAnsi(dev.output())).toContain("◇ Stopping dev services (docker compose)");
    expect(await composeStates(fixtureCwd)).toEqual(["exited"]);
  }, 120000);

  it("key:generate writes a strong NUXT_AUTH_SECRET into a missing .env", async () => {
    const fixtureCwd = scratchDir("key-generate");

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "key:generate");

    const written = readFileSync(join(fixtureCwd, ".env"), "utf8");
    const secret = written.match(/^NUXT_AUTH_SECRET=(.+)$/m)?.[1];

    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stripAnsi(stderr)).toBe("✔ Wrote NUXT_AUTH_SECRET to .env\n");
    expect(secret?.length).toBeGreaterThanOrEqual(32);
    expect(secret).not.toBe("changeme");
  });

  it("key:generate refuses and leaves an existing NUXT_AUTH_SECRET untouched", async () => {
    const fixtureCwd = scratchDir("key-generate-existing");

    const envContents = "NUXT_DATABASE_URL=postgres://example\nNUXT_AUTH_SECRET=already-set-secret\n";
    writeFileSync(join(fixtureCwd, ".env"), envContents);

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "key:generate");

    const after = readFileSync(join(fixtureCwd, ".env"), "utf8");

    expect(after).toBe(envContents);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stripAnsi(stderr)).toContain("✖ NUXT_AUTH_SECRET is already set, refusing to overwrite it");
    expect(stripAnsi(stderr)).toContain("→ To replace it, run nuxvel key:rotate NUXT_AUTH_SECRET");
  });

  it("push:keys writes a matching VAPID key pair into .env and refuses to replace it", async () => {
    const fixtureCwd = scratchDir("push-keys");

    const first = await runCliAt(fixtureCwd, "push:keys");
    const written = readFileSync(join(fixtureCwd, ".env"), "utf8");
    const publicKey = written.match(/^NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY=(.+)$/m)?.[1] ?? "";
    const privateKey = Buffer.from(written.match(/^NUXT_PUSH_VAPID_PRIVATE_KEY=(.+)$/m)?.[1] ?? "", "base64url");
    const derived = createECDH("prime256v1");
    derived.setPrivateKey(privateKey);

    expect(first.exitCode).toBe(0);
    expect(stripAnsi(first.stderr)).toBe(
      "✔ Wrote NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY and NUXT_PUSH_VAPID_PRIVATE_KEY to .env\n",
    );
    expect(privateKey).toHaveLength(32);
    expect(derived.getPublicKey("base64url")).toBe(publicKey);

    const second = await runCliAt(fixtureCwd, "push:keys");

    expect(second.exitCode).toBe(1);
    expect(readFileSync(join(fixtureCwd, ".env"), "utf8")).toBe(written);
    expect(stripAnsi(second.stderr)).toContain(
      "✖ NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY and NUXT_PUSH_VAPID_PRIVATE_KEY already set, refusing to overwrite",
    );
  });

  it("key:rotate replaces the secret and keeps the previous one for a grace period", async () => {
    const fixtureCwd = scratchDir("key-rotate");

    writeFileSync(join(fixtureCwd, ".env"), "NUXT_AUTH_SECRET=original-secret\n");

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "key:rotate", "NUXT_AUTH_SECRET");

    const written = readFileSync(join(fixtureCwd, ".env"), "utf8");
    const secret = written.match(/^NUXT_AUTH_SECRET=(.+)$/m)?.[1];
    const previous = written.match(/^NUXT_AUTH_SECRET_PREVIOUS=(.+)$/m)?.[1];
    const expiresAt = written.match(/^NUXT_AUTH_SECRET_PREVIOUS_EXPIRES_AT=(.+)$/m)?.[1] ?? "";

    expect(exitCode).toBe(0);
    expect(secret).not.toBe("original-secret");
    expect(secret?.length).toBeGreaterThanOrEqual(32);
    expect(previous).toBe("original-secret");
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());
    expect(stdout).toBe("");
    expect(stripAnsi(stderr)).toBe(
      `✔ Rotated NUXT_AUTH_SECRET, the previous value keeps verifying until ${expiresAt}\n`,
    );
  });

  it("build refuses to run without an --image", async () => {
    const { stdout, stderr, exitCode } = await runCliAt(scratchDir("build-no-image"), "build");

    expect(exitCode).toBe(2);
    expect(stdout).toBe("");
    expect(stripAnsi(stderr)).toContain("✖ Nothing to build");
    expect(stripAnsi(stderr)).toContain("→ Pass --image=<name:tag> to build a Docker image, or --artifact for an archive");
  });

  it("build reports a step per platform with its duration, and the archives on stdout", async () => {
    const fixtureCwd = scratchDir("build-steps");
    const bin = nodeOnlyPath(fixtureCwd);

    writeFileSync(join(fixtureCwd, "Dockerfile"), "FROM scratch\n");
    writeFileSync(join(fixtureCwd, "package.json"), JSON.stringify({ name: "steps-app", version: "1.0.0" }));
    writeFileSync(join(bin, "docker"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });

    const env = { ...process.env, PATH: bin };
    const artifact = await runCliWithEnv(
      fixtureCwd,
      env,
      "build",
      "--artifact",
      "--format=zip",
      "--platform=linux/amd64,linux/arm64",
    );
    const steps = stripAnsi(artifact.stderr);

    expect(artifact.exitCode, steps).toBe(0);
    expect(steps).toContain("┌  nuxvel build");
    expect(steps).toMatch(/◇  Built linux\/amd64 \(\d+ms\)/);
    expect(steps).toMatch(/◇  Built linux\/arm64 \(\d+ms\)/);
    expect(steps).toContain("└  2 archives in dist/");
    expect(stripAnsi(artifact.stdout).trimEnd().split("\n")).toEqual([
      "✔ Built dist/steps-app-1.0.0-linux-amd64.zip",
      "✔ Built dist/steps-app-1.0.0-linux-arm64.zip",
    ]);

    const image = await runCliWithEnv(fixtureCwd, env, "build", "--image=app:1", "--platform=linux/amd64");

    expect(image.exitCode, image.stderr).toBe(0);
    expect(stripAnsi(image.stderr)).toMatch(/◇  Built app:1 for linux\/amd64 \(\d+ms\)/);
    expect(stripAnsi(image.stderr)).toContain("└  Loaded app:1 into Docker");
  });

  it("build says docker is missing, with a hint, and exits 1", async () => {
    const fixtureCwd = scratchDir("build-no-docker");

    writeFileSync(join(fixtureCwd, "Dockerfile"), "FROM scratch\n");

    const { stdout, stderr, exitCode } = await runCliWithEnv(
      fixtureCwd,
      { ...process.env, PATH: nodeOnlyPath(fixtureCwd) },
      "build",
      "--image=app:1",
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stripAnsi(stderr)).toContain("✖ docker is not installed");
    expect(stripAnsi(stderr)).toContain("→ Install Docker Desktop");
  });

  it("build rejects --image or --push with --artifact, and --format without it", async () => {
    const fixtureCwd = scratchDir("build-flags");
    const rejected: Array<{ args: string[]; message: string; hint: string }> = [
      {
        args: ["--artifact", "--image=app:1"],
        message: "--image and --push build a Docker image",
        hint: "Drop them to build an --artifact archive",
      },
      {
        args: ["--artifact", "--push"],
        message: "--image and --push build a Docker image",
        hint: "Drop them to build an --artifact archive",
      },
      {
        args: ["--image=app:1", "--format=zip"],
        message: "--format applies to --artifact archives only",
        hint: "Add --artifact, or drop --format",
      },
      { args: ["--artifact", "--format=rar"], message: "Unknown --format=rar", hint: "Use --format tar or --format zip" },
    ];

    for (const { args, message, hint } of rejected) {
      const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "build", ...args);

      expect(exitCode, args.join(" ")).toBe(2);
      expect(stdout, args.join(" ")).toBe("");
      expect(stripAnsi(stderr), args.join(" ")).toContain(`✖ ${message}`);
      expect(stripAnsi(stderr), args.join(" ")).toContain(`→ ${hint}`);
    }

    expect(readdirSync(fixtureCwd)).toEqual([]);
  });

  it("routes lists the loaded app's tRPC procedures and Nitro routes in a table, module-added ones included, reporting no collisions", async () => {
    const appDir = scratchPlayground("routes");
    const { stdout, stderr, exitCode } = await runCliWithEnv(appDir, bootEnv, "routes");
    const { header, rows } = tableRows(stdout);

    expect(exitCode, stderr).toBe(0);
    expect(header).toEqual(["METHOD", "PATH", "SOURCE"]);
    expect(rows).toContainEqual(["GET", "/api/trpc/health.ping", "server/trpc/routers/health.router.ts"]);
    expect(rows).toContainEqual(["POST", "/api/trpc/health.create", "server/trpc/routers/health.router.ts"]);
    expect(rows).toContainEqual(["POST", "/api/trpc/apiKeys.create", "@nuxvel/nuxt"]);
    expect(rows).toContainEqual(["GET", "/api/_repeated-queries-check", "server/api/_repeated-queries-check.get.ts"]);
    expect(rows.find((row) => row[1] === "/api/health/live")).toEqual([
      "ALL",
      "/api/health/live",
      expect.stringMatching(/nuxt\/\S*runtime\/server\/routes\/health-live/),
    ]);
    expect(rows.map((row) => row.slice(0, 2))).toContainEqual(["POST", "/api/webhooks/:name"]);
    expect(stripAnsi(stderr)).toMatch(/✔ \d+ routes, no colliding paths/);

    const json = await runCliWithEnv(appDir, bootEnv, "routes", "--json");
    const listed = JSON.parse(json.stdout);

    expect(json.exitCode, json.stderr).toBe(0);
    expect(listed.collisions).toEqual([]);
    expect(listed.procedures).toContainEqual({
      name: "health.ping",
      type: "query",
      method: "GET",
      path: "/api/trpc/health.ping",
      source: "server/trpc/routers/health.router.ts",
      input: null,
      output: {},
    });
    expect(
      [...listed.procedures, ...listed.routes].map((route: { method: string; path: string; source: string }) => [route.method, route.path, route.source]),
    ).toEqual(expect.arrayContaining(rows));
    expect(listed.procedures.length + listed.routes.length).toBe(rows.length);
  }, 90000);

  it("channels lists every channel with guest access, its replay buffer and the servers listening, as a table or JSON", async () => {
    const appDir = scratchPlayground("channels");
    const redisUrl = await emptyWorkerRedis();
    const redis = new Redis(redisUrl);

    try {
      await redis.xadd("nuxvel:channel:_probe-public:replay", "*", "data", "{}");
      await redis.xadd("nuxvel:channel:_probe-public:replay", "*", "data", "{}");
    } finally {
      await redis.quit();
    }

    const env = { ...bootEnv, NUXT_REDIS_URL: redisUrl };
    const { stdout, stderr, exitCode } = await runCliWithEnv(appDir, env, "channels");
    const { header, rows } = tableRows(stdout);

    expect(exitCode, stderr).toBe(0);
    expect(header).toEqual(["NAME", "GUESTS", "REPLAY BUFFER", "SERVERS LISTENING"]);
    expect(rows).toContainEqual(["_probe-public", "allowed", "2 of 500", "0"]);
    expect(rows).toContainEqual(["_probe-admins", "refused", "0 of 500", "0"]);
    expect(rows).toContainEqual(["job:demo.countdown", "refused", "0 of 500", "0"]);
    expect(rows.map((row) => row[0])).toContain("flags");

    const json = await runCliWithEnv(appDir, env, "channels", "--json");
    const { channels } = JSON.parse(json.stdout);

    expect(json.exitCode, json.stderr).toBe(0);
    expect(channels.map((channel: { name: string }) => channel.name)).toEqual(rows.map((row) => row[0]));
    expect(channels).toContainEqual({
      name: "_probe-public",
      guests: true,
      buffered: 2,
      replayLimit: 500,
      listeningServers: 0,
    });
  }, 90000);

  it("openapi:export writes the OpenAPI document to a file, or prints it", async () => {
    const appDir = scratchPlayground("openapi");
    const written = await runCliWithEnv(appDir, bootEnv, "openapi:export", "openapi.json");
    const document = JSON.parse(readFileSync(join(appDir, "openapi.json"), "utf8"));

    expect(written.exitCode, written.stderr).toBe(0);
    expect(stripAnsi(written.stderr)).toContain(`✔ Wrote the OpenAPI document to ${join(appDir, "openapi.json")}`);
    expect(document.info).toEqual({ title: "nuxvel playground", version: "1.0.0" });
    expect(Object.keys(document.paths)).toEqual(expect.arrayContaining(["/posts", "/posts/{id}"]));

    const printed = await runCliWithEnv(appDir, bootEnv, "openapi:export");

    expect(printed.exitCode, printed.stderr).toBe(0);
    expect(JSON.parse(printed.stdout)).toEqual(document);
  }, 90000);

  it("routes flags two files that resolve to the same method and path", async () => {
    const fixtureCwd = scratchDir("routes");

    buildServerFixture(fixtureCwd);
    mkdirSync(join(fixtureCwd, "server", "api", "thing"), { recursive: true });
    writeFileSync(join(fixtureCwd, "server", "api", "thing.get.ts"), "export default {};\n");
    writeFileSync(join(fixtureCwd, "server", "api", "thing", "index.get.ts"), "export default {};\n");

    const { stdout, stderr, exitCode } = await runCliWithEnv(fixtureCwd, bootEnv, "routes");

    expect(exitCode).toBe(1);
    expect(tableRows(stdout).rows).toContainEqual(["GET", "/api/thing", "server/api/thing.get.ts"]);
    expect(stripAnsi(stderr)).toContain("1 colliding path");
    expect(stripAnsi(stderr)).toContain("GET /api/thing  server/api/thing.get.ts, server/api/thing/index.get.ts");

    const json = await runCliWithEnv(fixtureCwd, bootEnv, "routes", "--json");

    expect(json.exitCode).toBe(1);
    expect(JSON.parse(json.stdout).collisions).toEqual([
      { method: "GET", path: "/api/thing", sources: ["server/api/thing.get.ts", "server/api/thing/index.get.ts"] },
    ]);
  }, 90000);

  it("routes names procedures the way the router build does and matches collisions across parameter names and methods", async () => {
    const fixtureCwd = scratchDir("routes-names");

    buildServerFixture(fixtureCwd);
    mkdirSync(join(fixtureCwd, "server", "trpc", "routers", "admin"), { recursive: true });
    mkdirSync(join(fixtureCwd, "server", "api", "posts"), { recursive: true });
    mkdirSync(join(fixtureCwd, "server", "api", "items"), { recursive: true });
    writeFileSync(
      join(fixtureCwd, "server", "trpc", "routers", "admin", "index.ts"),
      "export default { stats: publicProcedure.query(() => 1) };\n",
    );
    writeFileSync(join(fixtureCwd, "server", "api", "posts", "[id].get.ts"), "export default {};\n");
    writeFileSync(join(fixtureCwd, "server", "api", "posts", "[slug].get.ts"), "export default {};\n");
    writeFileSync(join(fixtureCwd, "server", "api", "items", "[id].ts"), "export default {};\n");
    writeFileSync(join(fixtureCwd, "server", "api", "items", "[name].post.ts"), "export default {};\n");

    const { stdout, stderr, exitCode } = await runCliWithEnv(fixtureCwd, bootEnv, "routes");

    expect(exitCode).toBe(1);
    expect(tableRows(stdout).rows).toContainEqual(["GET", "/api/trpc/admin.index.stats", "server/trpc/routers/admin/index.ts"]);
    expect(stripAnsi(stderr)).toContain("GET /api/posts/:param  server/api/posts/[id].get.ts, server/api/posts/[slug].get.ts");
    expect(stripAnsi(stderr)).toContain("ALL|POST /api/items/:param  server/api/items/[id].ts, server/api/items/[name].post.ts");

    writeFileSync(
      join(fixtureCwd, "server", "trpc", "routers", "admin.ts"),
      "export default { ping: publicProcedure.query(() => 1) };\n",
    );

    const clash = await runCliWithEnv(fixtureCwd, bootEnv, "routes");

    expect(clash.exitCode).toBe(1);
    expect(clash.stderr).toContain('both define the tRPC namespace "admin"');
  }, 120000);

  it("routes --diff reports breaking procedure changes since a git ref", async () => {
    const fixtureCwd = scratchDir("routes-diff");
    const router = join(fixtureCwd, "server", "trpc", "routers", "post.ts");
    const git = (...args: string[]) =>
      execFileAsync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", ...args], { cwd: fixtureCwd });

    buildServerFixture(fixtureCwd);
    mkdirSync(dirname(router), { recursive: true });
    writeFileSync(join(fixtureCwd, ".gitignore"), "node_modules\n.nuxt\n.output\n.nuxvel\n");
    writeFileSync(
      router,
      `import { z } from "zod";

export default {
  list: publicProcedure.query(() => []),
  byId: publicProcedure
    .input(z.object({ id: z.number(), preview: z.boolean().optional() }))
    .output(z.object({ id: z.number(), title: z.string() }))
    .query(({ input }) => ({ id: input.id, title: "Hello" })),
};
`,
    );
    await git("init", "-q");
    await git("add", ".");
    await git("commit", "-q", "-m", "posts");

    const unchanged = await runCliWithEnv(fixtureCwd, bootEnv, "routes", "--diff=HEAD");

    expect(unchanged.exitCode, unchanged.stderr).toBe(0);
    expect(stripAnsi(unchanged.stderr)).toContain("✔ No breaking API changes since HEAD");

    writeFileSync(
      router,
      `import { z } from "zod";

export default {
  byId: publicProcedure
    .input(z.object({ id: z.number(), locale: z.string() }))
    .output(z.object({ id: z.number() }))
    .query(({ input }) => ({ id: input.id })),
};
`,
    );

    const { stderr, exitCode } = await runCliWithEnv(fixtureCwd, bootEnv, "routes", "--diff=HEAD");

    expect(exitCode).toBe(1);
    expect(stripAnsi(stderr)).toContain("4 breaking API changes since HEAD");

    const json = await runCliWithEnv(fixtureCwd, bootEnv, "routes", "--diff=HEAD", "--json");

    expect(json.exitCode).toBe(1);
    expect(JSON.parse(json.stdout).breaking).toEqual([
      "post.list: removed or renamed",
      'post.byId: input field "preview" removed',
      'post.byId: input field "locale" is now required',
      'post.byId: output field "title" removed',
    ]);
  }, 240000);

  it("routes --diff-env compares with the route list of the live release, read over SSH", async () => {
    const fixtureCwd = scratchDir("routes-diff-env");
    const router = join(fixtureCwd, "server", "trpc", "routers", "post.ts");
    const bin = join(fixtureCwd, "bin");
    const liveRoutes = join(fixtureCwd, "live-routes.json");
    const env = { ...bootEnv, PATH: `${bin}:${process.env.PATH}` };
    const writeRouter = (procedures: string) =>
      writeFileSync(router, `import { z } from "zod";\n\nexport default {\n${procedures}\n};\n`);

    buildServerFixture(fixtureCwd);
    mkdirSync(dirname(router), { recursive: true });
    mkdirSync(bin);
    writeFileSync(join(bin, "ssh"), `#!/bin/sh\ncat ${liveRoutes}\n`);
    chmodSync(join(bin, "ssh"), 0o755);
    writeFileSync(
      join(fixtureCwd, "nuxvel.deploy.ts"),
      `import { defineDeploy } from "@nuxvel/cli/deploy";

export default defineDeploy({
  app: "posts",
  environments: { production: { servers: [{ host: "203.0.113.10", user: "deploy", roles: ["web"] }], arch: "amd64", domains: ["posts.example.com"] } },
});
`,
    );
    writeRouter(`  latest: publicProcedure.output(z.object({ id: z.number(), title: z.string() })).query(() => ({ id: 1, title: "Hi" })),`);

    const listed = await runCliWithEnv(fixtureCwd, env, "routes", "--json");
    expect(listed.exitCode, listed.stderr).toBe(0);
    writeFileSync(liveRoutes, listed.stdout);

    const unchanged = await runCliWithEnv(fixtureCwd, env, "routes", "--diff-env=production");
    expect(unchanged.exitCode, unchanged.stderr).toBe(0);
    expect(stripAnsi(unchanged.stderr)).toContain("✔ No breaking API changes since the live release of production");

    writeRouter(`  latest: publicProcedure.output(z.object({ id: z.number() })).query(() => ({ id: 1 })),`);
    const breaking = await runCliWithEnv(fixtureCwd, env, "routes", "--diff-env=production", "--json");
    expect(breaking.exitCode).toBe(1);
    expect(JSON.parse(breaking.stdout).breaking).toEqual(['post.latest: output field "title" removed']);

    writeFileSync(liveRoutes, "@no-live\n");
    const first = await runCliWithEnv(fixtureCwd, env, "routes", "--diff-env=production");
    expect(first.exitCode, first.stderr).toBe(0);
    expect(stripAnsi(first.stderr)).toContain("posts has no live release on 203.0.113.10, so no call can break");

    writeFileSync(liveRoutes, "@missing 20260927T100000Z-abc1234\n");
    const missing = await runCliWithEnv(fixtureCwd, env, "routes", "--diff-env=production");
    expect(missing.exitCode).toBe(1);
    expect(stripAnsi(missing.stderr)).toContain("✖ The live release 20260927T100000Z-abc1234 of posts has no nuxvel-routes.json");
    expect(stripAnsi(missing.stderr)).toContain("NUXT_DATABASE_URL=postgres://build@127.0.0.1/unused NUXT_AUTH_SECRET=build-time-route-list-only-not-a-secret npx nuxvel routes --json > nuxvel-routes.json");
  }, 240000);

  it("routes and events read a layer the app extends like the module does", async () => {
    const fixtureCwd = scratchDir("routes-layer");
    const layerServer = join(fixtureCwd, "layer", "server");
    const config = join(fixtureCwd, "nuxt.config.ts");

    buildServerFixture(fixtureCwd);
    writeFileSync(config, readFileSync(config, "utf8").replace("compatibilityDate: '2025-07-15',", "compatibilityDate: '2025-07-15',\n  extends: ['./layer'],"));
    mkdirSync(join(layerServer, "trpc", "routers"), { recursive: true });
    mkdirSync(join(layerServer, "events", "gadget"), { recursive: true });
    mkdirSync(join(layerServer, "listeners", "audit"), { recursive: true });
    mkdirSync(join(layerServer, "domains", "widget", "events"), { recursive: true });
    mkdirSync(join(layerServer, "domains", "widget", "listeners"), { recursive: true });
    writeFileSync(
      join(layerServer, "domains", "widget", "events", "moved.event.ts"),
      'import { z } from "zod";\n\nexport const widgetMovedEvent = defineEvent({ payload: z.object({ id: z.number() }) });\n',
    );
    writeFileSync(
      join(layerServer, "domains", "widget", "listeners", "log-move.listener.ts"),
      'import { widgetMovedEvent } from "../events/moved.event";\n\nexport default defineListener({ event: widgetMovedEvent, handler: async () => {} });\n',
    );
    writeFileSync(join(fixtureCwd, "layer", "nuxt.config.ts"), "export default defineNuxtConfig({});\n");
    writeFileSync(join(layerServer, "trpc", "routers", "layered.ts"), "export default { ping: publicProcedure.query(() => 1) };\n");
    writeFileSync(
      join(layerServer, "events", "gadget", "built.ts"),
      'import { z } from "zod";\n\nexport const gadgetBuilt = defineEvent({ payload: z.object({ id: z.number() }) });\n',
    );
    writeFileSync(
      join(layerServer, "listeners", "audit", "record-gadget.ts"),
      'import { gadgetBuilt } from "../../events/gadget/built";\n\nexport default defineListener({ event: gadgetBuilt, handler: async () => {} });\n',
    );

    const routes = await runCliWithEnv(fixtureCwd, bootEnv, "routes");

    expect(routes.exitCode, routes.stderr).toBe(0);
    expect(tableRows(routes.stdout).rows).toContainEqual(["GET", "/api/trpc/layered.ping", "layer/server/trpc/routers/layered.ts"]);

    const events = await runCliAt(fixtureCwd, "events");

    expect(events.exitCode, events.stderr).toBe(0);
    expect(tableRows(events.stdout).rows).toContainEqual([
      "gadget.built",
      "layer/server/events/gadget/built.ts",
      "nothing",
      "audit.record-gadget (queued)",
    ]);
    expect(tableRows(events.stdout).rows).toContainEqual([
      "widget.moved",
      "layer/server/domains/widget/events/moved.event.ts",
      "nothing",
      "widget.log-move (queued)",
    ]);
  }, 120000);

  it("test:arch passes against the playground, leaving out the probes its own config ignores", async () => {
    const appDir = scratchPlayground("test-arch");
    const { stdout, stderr, exitCode } = await runCliWithEnv(
      appDir,
      { ...process.env, PLAYGROUND_TEST_PROBES: "" },
      "test:arch",
    );

    expect(exitCode, `${stdout}${stderr}`).toBe(0);
    expect(stdout).toBe("");
    expect(stripAnsi(stderr)).toContain("✔ All architecture rules pass");

    const withProbes = await runCliAt(appDir, "test:arch");

    expect(withProbes.exitCode).toBe(1);
    expect(withProbes.stdout).toBe("");
    expect(stripAnsi(withProbes.stderr)).toContain(
      "✖ server/trpc/routers/_unique-violation-check.ts: routers may not call useDb().insert/update/delete, call an action",
    );
    expect(stripAnsi(withProbes.stderr)).toMatch(/✖ \d+ architecture violations?\n$/);
  }, 60000);

  it("test:arch flags an action that imports h3, one with a mismatched export, and a router that writes, and passes a suffixed action export", async () => {
    const fixtureCwd = scratchDir("arch");

    buildNuxtFixture(fixtureCwd);
    mkdirSync(join(fixtureCwd, "server", "actions", "widgets"), { recursive: true });
    mkdirSync(join(fixtureCwd, "server", "trpc", "routers"), { recursive: true });

    writeFileSync(
      join(fixtureCwd, "server", "actions", "widgets", "archive-widget.ts"),
      'import { getQuery } from "h3";\n\nexport const archiveWidget = defineAction({});\n',
    );
    writeFileSync(
      join(fixtureCwd, "server", "actions", "widgets", "create-widget.ts"),
      "export const createWidgetThing = defineAction({});\n",
    );
    writeFileSync(
      join(fixtureCwd, "server", "actions", "widgets", "rename-widget.action.ts"),
      "export const renameWidgetAction = defineAction({});\n",
    );
    writeFileSync(
      join(fixtureCwd, "server", "trpc", "routers", "widgets.ts"),
      'useDb().insert(widgets).values({ name: "x" });\n',
    );

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "test:arch");
    const lines = violationLines(stderr);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(lines).toHaveLength(4);
    expect(lines.find((line) => line.includes("archive-widget.ts"))).toMatch(/^✖ .*archive-widget\.ts: actions may not import h3/);
    expect(lines.find((line) => line.includes("create-widget.ts"))).toMatch(/^✖ .*create-widget\.ts: one action per file/);
    expect(lines.find((line) => line.includes("widgets.ts: routers"))).toMatch(/^✖ .*widgets\.ts: routers may not call useDb\(\)/);
    expect(lines.at(-1)).toBe("✖ 3 architecture violations");
  }, 60000);

  it("test:arch flags a query or mutation without an .output() schema, and passes one with it", async () => {
    const fixtureCwd = scratchDir("arch-router-output");

    buildNuxtFixture(fixtureCwd);
    mkdirSync(join(fixtureCwd, "server", "trpc", "routers"), { recursive: true });
    writeFileSync(
      join(fixtureCwd, "server", "trpc", "routers", "gadget.router.ts"),
      [
        "export const gadgetRouter = {",
        "  list: publicProcedure.query(() => []),",
        "  rename: authedProcedure.input(renameGadgetInput).mutation(({ input }) => input),",
        "  byId: publicProcedure.input(gadgetIdInput).output(gadgetSchema).query(({ input }) => findOrFail(gadgetTable, input.id)),",
        "  raw: publicProcedure.output(z.number()).query(() => pool.query(\"select 1\").then(() => 1)),",
        "};",
        "",
      ].join("\n"),
    );

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "test:arch");
    const lines = violationLines(stderr);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(lines).toEqual([
      "✖ server/trpc/routers/gadget.router.ts: list has no .output() schema: list the fields that are safe to send to the browser",
      "✖ server/trpc/routers/gadget.router.ts: rename has no .output() schema: list the fields that are safe to send to the browser",
      "✖ 2 architecture violations",
    ]);
  }, 60000);

  it("test:arch flags a sync listener that makes a network call, and passes a queued one", async () => {
    const fixtureCwd = scratchDir("arch-listeners");
    const listeners = {
      "notify-sync.ts": 'export default defineListener({ event: postPublished, sync: true, handler: async () => { await $fetch("https://example.com"); } });\n',
      "mail-sync.ts": 'export default defineListener({ event: postPublished, sync: true, handler: async () => { await sendMail("welcome", {}); } });\n',
      "mail-now-sync.ts": 'export default defineListener({ event: postPublished, sync: true, handler: async () => { await sendMailNow("welcome", {}); } });\n',
      "mail-queued.ts": 'export default defineListener({ event: postPublished, handler: async () => { await sendMail("welcome", {}); } });\n',
      "count-sync.ts": "export default defineListener({ event: postPublished, sync: true, handler: async () => { await useDb().execute(\"select 1\"); } });\n",
    };

    buildNuxtFixture(fixtureCwd);
    mkdirSync(join(fixtureCwd, "server", "listeners", "post"), { recursive: true });

    for (const [file, content] of Object.entries(listeners)) {
      writeFileSync(join(fixtureCwd, "server", "listeners", "post", file), content);
    }

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "test:arch");

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(violationLines(stderr)).toEqual([
      "✖ server/listeners/post/mail-now-sync.ts: sync listeners may not call sendMailNow(), it holds the emitting transaction open: remove sync: true to queue the listener",
      "✖ server/listeners/post/mail-sync.ts: sync listeners may not call sendMail(), it holds the emitting transaction open: remove sync: true to queue the listener",
      "✖ server/listeners/post/notify-sync.ts: sync listeners may not call $fetch(), it holds the emitting transaction open: remove sync: true to queue the listener",
      "✖ 3 architecture violations",
    ]);
  }, 60000);

  it("test:arch flags a listener that emits its own event, and passes one that emits another", async () => {
    const fixtureCwd = scratchDir("arch-emit-loop");
    const imports = 'import { postPublished } from "#server/events/post/published";\nimport { postShared } from "#server/events/post/shared";\n\n';
    const listeners = {
      "republish.ts": `${imports}export default defineListener({ event: postPublished, handler: async (payload) => { await emit(postPublished, payload); } });\n`,
      "republish-by-name.ts": `${imports}export default defineListener({ event: postPublished, handler: async (payload) => { await emit("post.published", payload); } });\n`,
      "share.ts": `${imports}export default defineListener({ event: postPublished, handler: async (payload) => { await emit(postShared, payload); } });\n`,
    };

    buildNuxtFixture(fixtureCwd);
    mkdirSync(join(fixtureCwd, "server", "listeners", "post"), { recursive: true });

    for (const [file, content] of Object.entries(listeners)) {
      writeFileSync(join(fixtureCwd, "server", "listeners", "post", file), content);
    }

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "test:arch");

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(violationLines(stderr).sort()).toEqual([
      "✖ 2 architecture violations",
      "✖ server/listeners/post/republish-by-name.ts: listeners may not emit the event they listen to, it runs the listener again in a loop",
      "✖ server/listeners/post/republish.ts: listeners may not emit the event they listen to, it runs the listener again in a loop",
    ]);
  }, 60000);

  it("test:arch flags a route that writes or calls an action, and skips reads, probes, webhooks, uploads and auth", async () => {
    const fixtureCwd = scratchDir("arch-routes");
    const insert = 'export default defineEventHandler(() => useDb().insert(posts).values({ title: "x" }));\n';
    const routes = {
      "api/posts.post.ts": insert,
      "routes/publish.post.ts":
        'import { publishPost } from "#server/actions/posts/publish-post";\n\nexport default defineEventHandler(() => publishPost({ id: 1 }));\n',
      "api/posts.get.ts": "export default defineEventHandler(() => useDb().select().from(posts));\n",
      "api/_probe.get.ts": insert,
      "api/webhooks/stripe.post.ts": insert,
      "api/uploads/avatar.post.ts": insert,
      "routes/auth/callback.get.ts": insert,
    };

    buildNuxtFixture(fixtureCwd);

    for (const [file, content] of Object.entries(routes)) {
      mkdirSync(dirname(join(fixtureCwd, "server", file)), { recursive: true });
      writeFileSync(join(fixtureCwd, "server", file), content);
    }

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "test:arch");

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(violationLines(stderr).sort()).toEqual([
      "✖ 2 architecture violations",
      "✖ server/api/posts.post.ts: routes may not call useDb().insert/update/delete, write through a tRPC mutation that calls an action",
      "✖ server/routes/publish.post.ts: routes may not call an action, write through a tRPC mutation that calls it",
    ]);
  }, 60000);

  it("test:arch flags a table with a userId column and no defineUserData(), and passes a declared one", async () => {
    const fixtureCwd = scratchDir("arch-user-data");
    const table = (name: string, variable: string) =>
      `import { pgTable, serial, text } from "drizzle-orm/pg-core";\n\nexport const ${variable} = pgTable("${name}", { id: serial("id").primaryKey(), userId: text("user_id") });\n`;

    buildNuxtFixture(fixtureCwd);
    mkdirSync(join(fixtureCwd, "server", "database", "schema"), { recursive: true });
    mkdirSync(join(fixtureCwd, "server", "privacy"), { recursive: true });
    writeFileSync(join(fixtureCwd, "server", "database", "schema", "comments.ts"), table("comments", "comments"));
    writeFileSync(join(fixtureCwd, "server", "database", "schema", "likes.ts"), table("likes", "likes"));
    writeFileSync(join(fixtureCwd, "server", "database", "schema", "auth.ts"), table("session", "session"));
    writeFileSync(
      join(fixtureCwd, "server", "privacy", "likes.ts"),
      'import { likes } from "#nuxvel/schema";\n\nexport default defineUserData(likes, likes.userId);\n',
    );

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "test:arch");

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(violationLines(stderr)).toEqual([
      "✖ server/database/schema/comments.ts: column userId of table comments references the user table but no defineUserData() in server/privacy/, declare it so exportUserData() and eraseUserData() find its rows",
      "✖ 1 architecture violation",
    ]);
  }, 60000);

  it("test:arch lints the actions, routers and tables of a domain folder", async () => {
    const fixtureCwd = scratchDir("arch-domains");
    const domain = join(fixtureCwd, "server", "domains", "order");
    const table = (name: string) =>
      `import { pgTable, serial, text } from "drizzle-orm/pg-core";\n\nexport const ${name}Table = pgTable("${name}", { id: serial("id").primaryKey(), userId: text("user_id") });\n`;

    buildNuxtFixture(fixtureCwd);
    for (const folder of ["actions", "routers", "schema"]) mkdirSync(join(domain, folder), { recursive: true });
    mkdirSync(join(fixtureCwd, "server", "privacy"), { recursive: true });
    writeFileSync(join(domain, "actions", "place.action.ts"), "export const placeOrderThing = defineAction({});\n");
    writeFileSync(join(domain, "actions", "cancel.action.ts"), "export const cancelAction = defineAction({});\n");
    writeFileSync(join(domain, "routers", "order.router.ts"), 'useDb().insert(orders).values({ name: "x" });\n');
    writeFileSync(join(domain, "schema", "orders.schema.ts"), table("orders"));
    writeFileSync(join(domain, "schema", "refunds.schema.ts"), table("refunds"));
    writeFileSync(
      join(fixtureCwd, "server", "privacy", "refunds.user-data.ts"),
      'import { refundsTable } from "#nuxvel/schema";\n\nexport default defineUserData(refundsTable, refundsTable.userId);\n',
    );

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "test:arch");

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(violationLines(stderr).sort()).toEqual([
      "✖ 3 architecture violations",
      "✖ server/domains/order/actions/place.action.ts: one action per file, exported under the filename's camelCase name",
      expect.stringMatching(/^✖ server\/domains\/order\/routers\/order\.router\.ts: routers may not call useDb\(\)/),
      "✖ server/domains/order/schema/orders.schema.ts: column userId of table ordersTable references the user table but no defineUserData() in server/privacy/, declare it so exportUserData() and eraseUserData() find its rows",
    ]);
  }, 60000);

  it("test:arch flags v-html in an app component, and passes one that renders <SafeHtml>", async () => {
    const fixtureCwd = scratchDir("arch-v-html");

    buildNuxtFixture(fixtureCwd);
    mkdirSync(join(fixtureCwd, "app", "components"), { recursive: true });
    writeFileSync(
      join(fixtureCwd, "app", "components", "PostBody.vue"),
      '<script setup lang="ts">\ndefineProps<{ body: string }>();\n</script>\n\n<template>\n  <article v-html="body" />\n</template>\n',
    );
    writeFileSync(
      join(fixtureCwd, "app", "components", "PostExcerpt.vue"),
      '<script setup lang="ts">\ndefineProps<{ body: string }>();\n</script>\n\n<template>\n  <SafeHtml :html="body" />\n</template>\n',
    );

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "test:arch");

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(violationLines(stderr)).toEqual([
      "✖ app/components/PostBody.vue: v-html renders HTML that nothing sanitized, use <SafeHtml :html> with sanitizeHtml() output",
      "✖ 1 architecture violation",
    ]);
  }, 60000);

  it("test:arch flags a key that a locale lacks, a key two layers give different texts, and a literal key that no default locale file has", async () => {
    const fixtureCwd = scratchDir("arch-translations");
    const writeJson = (path: string, messages: object) => {
      mkdirSync(dirname(join(fixtureCwd, path)), { recursive: true });
      writeFileSync(join(fixtureCwd, path), JSON.stringify(messages));
    };

    buildNuxtFixture(fixtureCwd);
    writeJson("locales/en.json", { home: { title: "Home", intro: "Welcome" }, common: { save: "Save" } });
    writeJson("locales/zh.json", { home: { title: "首页" }, common: { save: "保存" } });
    writeJson("locales/pages/posts/en.json", { heading: "Posts" });
    writeJson("locales/pages/posts/zh.json", { heading: "文章" });
    writeJson("layers/billing/locales/en.json", { common: { save: "Save the invoice" } });
    writeFileSync(join(fixtureCwd, "layers", "billing", "nuxt.config.ts"), "export default {};\n");
    mkdirSync(join(fixtureCwd, "app", "pages"), { recursive: true });
    writeFileSync(
      join(fixtureCwd, "app", "pages", "posts.vue"),
      [
        '<script setup lang="ts">',
        "const { ts } = useI18n();",
        "const props = defineProps<{ state: string; draft: boolean }>();",
        'useHead({ title: () => ts("home.titel") });',
        "</script>",
        "",
        "<template>",
        '  <h1>{{ $t("heading") }}</h1>',
        '  <p>{{ $t("home.title") }} {{ $t(`status.${props.state}`) }} {{ $t("nuxvel.authForm.signIn") }}</p>',
        '  <p>{{ $t(draft ? "home.intro" : "home.outro") }}</p>',
        '  <i18n-t keypath="home.missing" tag="p" />',
        "</template>",
        "",
      ].join("\n"),
    );

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "test:arch");

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(violationLines(stderr).sort()).toEqual([
      "✖ 6 architecture violations",
      '✖ app/pages/posts.vue: "home.missing" is in no en.json, add it to the translation file of the default locale',
      '✖ app/pages/posts.vue: "home.outro" is in no en.json, add it to the translation file of the default locale',
      '✖ app/pages/posts.vue: "home.titel" is in no en.json, add it to the translation file of the default locale',
      "✖ common.save has a different text in locales/en.json and layers/billing/locales/en.json, give each meaning its own key",
      "✖ layers/billing/locales/zh.json: missing, translate layers/billing/locales/en.json into it",
      "✖ locales/zh.json: missing home.intro, which locales/en.json has",
    ]);
  }, 60000);

  it("test:arch flags an internal path string in a link or a navigation, and passes route names, server paths and full URLs", async () => {
    const fixtureCwd = scratchDir("arch-typed-routes");

    buildNuxtFixture(fixtureCwd);
    mkdirSync(join(fixtureCwd, "app", "components"), { recursive: true });
    mkdirSync(join(fixtureCwd, "app", "middleware"), { recursive: true });
    writeFileSync(
      join(fixtureCwd, "app", "components", "PostLinks.vue"),
      [
        '<script setup lang="ts">',
        "const props = defineProps<{ id: string }>();",
        "const router = useRouter();",
        "",
        "function open() {",
        "  return router.push(`/posts/${props.id}`);",
        "}",
        "</script>",
        "",
        "<template>",
        '  <NuxtLink to="/sign-in">Sign in</NuxtLink>',
        "  <ULink :to=\"'/posts'\">Posts</ULink>",
        '  <u-button :to="`/posts/${id}/edit`">Edit</u-button>',
        "  <UButton @click=\"navigateTo('/')\">Home</UButton>",
        "  <NuxtLink :to=\"{ name: 'posts-id', params: { id } }\">Post</NuxtLink>",
        '  <NuxtLink to="/api/posts/export">Export</NuxtLink>',
        '  <NuxtLink to="/_nuxvel/health">Health</NuxtLink>',
        '  <ULink to="https://nuxt.com">Nuxt</ULink>',
        '  <ULink to="//cdn.example.com/logo.png">Logo</ULink>',
        "  <UButton :to=\"{ query: { page: 2 } }\" @click=\"open\">Next</UButton>",
        "</template>",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(fixtureCwd, "app", "middleware", "auth.ts"),
      [
        "export default defineNuxtRouteMiddleware(() => {",
        "  if (Math.random() > 2) return navigateTo(\"/webhooks/stripe\");",
        "  useRouter().replace(\"/dashboard?tab=1\");",
        "  return navigateTo(\"/sign-in\");",
        "});",
        "",
      ].join("\n"),
    );

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "test:arch");

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(violationLines(stderr)).toEqual([
      "✖ app/components/PostLinks.vue: `/posts/${props.id}` is a path string: use a route name, { name: '...' }",
      "✖ app/components/PostLinks.vue: \"/sign-in\" is a path string: use a route name, { name: '...' }",
      "✖ app/components/PostLinks.vue: \"/posts\" is a path string: use a route name, { name: '...' }",
      "✖ app/components/PostLinks.vue: `/posts/${id}/edit` is a path string: use a route name, { name: '...' }",
      "✖ app/components/PostLinks.vue: \"/\" is a path string: use a route name, { name: '...' }",
      "✖ app/middleware/auth.ts: \"/dashboard?tab=1\" is a path string: use a route name, { name: '...' }",
      "✖ app/middleware/auth.ts: \"/sign-in\" is a path string: use a route name, { name: '...' }",
      "✖ 7 architecture violations",
    ]);
  }, 60000);

  it("test:arch lints a layer inside the project and skips one outside it", async () => {
    const fixtureCwd = scratchDir("arch-layers");
    const outsideLayer = scratchDir("arch-outside-layer");
    const insideLayer = join(fixtureCwd, "..shared", "layer");
    const config = join(fixtureCwd, "nuxt.config.ts");
    const violation = 'import { getQuery } from "h3";\n\nexport const archiveWidget = defineAction({});\n';

    buildNuxtFixture(fixtureCwd);
    writeFileSync(
      config,
      readFileSync(config, "utf8").replace(
        "compatibilityDate: '2025-07-15',",
        `compatibilityDate: '2025-07-15',\n  extends: [${JSON.stringify(insideLayer)}, ${JSON.stringify(outsideLayer)}],`,
      ),
    );

    for (const layer of [insideLayer, outsideLayer]) {
      mkdirSync(join(layer, "server", "actions", "widgets"), { recursive: true });
      writeFileSync(join(layer, "nuxt.config.ts"), "export default {};\n");
      writeFileSync(join(layer, "server", "actions", "widgets", "archive-widget.ts"), violation);
    }

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "test:arch");
    const lines = violationLines(stderr);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(lines).toEqual([
      "✖ ..shared/layer/server/actions/widgets/archive-widget.ts: actions may not import h3, call auth() or requireAuth(), or read the request (useEvent, getHeader, readBody, ...)",
      "✖ 1 architecture violation",
    ]);
  }, 60000);

  it("test:arch flags an import from another module in layers/ outside its shared/ folder", async () => {
    const fixtureCwd = scratchDir("arch-module-imports");
    const shop = join(fixtureCwd, "layers", "shop");
    const files = {
      "server/utils/checkout.ts": 'import { invoiceTotal } from "../../../billing/server/utils/total";\n\nexport const checkout = invoiceTotal;\n',
      "server/utils/refund.ts": 'export { refund } from "#layers/billing/server/utils/refund";\n',
      "app/pages/cart.vue":
        '<script setup lang="ts">\nimport { formatInvoice } from "#layers/billing/app/utils/format";\n</script>\n\n<template>\n  <p>{{ formatInvoice }}</p>\n</template>\n',
      "server/utils/price.ts": 'import { money } from "#layers/billing/shared/money";\nimport { cart } from "#layers/shop/server/utils/cart";\nimport { checkout } from "./checkout";\n\nexport const price = [money, cart, checkout];\n',
    };

    buildNuxtFixture(fixtureCwd);

    for (const layer of ["shop", "billing"]) {
      mkdirSync(join(fixtureCwd, "layers", layer), { recursive: true });
      writeFileSync(join(fixtureCwd, "layers", layer, "nuxt.config.ts"), "export default {};\n");
    }

    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(shop, file)), { recursive: true });
      writeFileSync(join(shop, file), content);
    }

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "test:arch");

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(violationLines(stderr).sort()).toEqual([
      "✖ 4 architecture violations",
      "✖ layers/shop/app/pages/cart.vue: layers/shop/ may import from layers/billing/ only under layers/billing/shared/",
      "✖ layers/shop/server/utils/checkout.ts: ../../../billing/server/utils/total leaves layers/shop/server/utils/ for layers/billing/server/utils/: import it from #layers/billing/server/utils/total",
      "✖ layers/shop/server/utils/checkout.ts: layers/shop/ may import from layers/billing/ only under layers/billing/shared/",
      "✖ layers/shop/server/utils/refund.ts: layers/shop/ may import from layers/billing/ only under layers/billing/shared/",
    ]);
  }, 60000);

  it("test:arch flags a ../ import into another kind folder and an import of shared/schemas/ in server code, and passes an alias or a sibling", async () => {
    const fixtureCwd = scratchDir("arch-parent-imports");
    const files = {
      "server/jobs/report.job.ts": 'import { userTable } from "../database/schema/auth.schema";\n\nexport const report = userTable;\n',
      "server/utils/report.ts": 'import { createPostInput } from "#shared/schemas/post";\nimport { userTable } from "#nuxvel/schema";\nimport { slug } from "./slug";\n\nexport const report = [createPostInput, userTable, slug];\n',
      "app/components/ReportCard.vue":
        '<script setup lang="ts">\nimport { slug } from "../../server/utils/slug";\n</script>\n\n<template>\n  <p>{{ slug }}</p>\n</template>\n',
      "shared/utils/report.ts": 'import { slug } from "./format";\n\nexport const reportSlug = slug;\n',
      "tests/functional/report.ts": 'import ReportCard from "../../app/components/ReportCard.vue";\n\nexport const card = ReportCard;\n',
    };

    buildNuxtFixture(fixtureCwd);

    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(fixtureCwd, file)), { recursive: true });
      writeFileSync(join(fixtureCwd, file), content);
    }

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "test:arch");

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(violationLines(stderr).sort()).toEqual([
      "✖ 4 architecture violations",
      "✖ app/components/ReportCard.vue: ../../server/utils/slug leaves app/components/ for server/utils/: app/ does not import server code",
      "✖ server/jobs/report.job.ts: ../database/schema/auth.schema leaves server/jobs/ for server/database/schema/: import it from #nuxvel/schema",
      "✖ server/utils/report.ts: #shared/schemas/post is in shared/schemas/, whose exports server/ auto-imports: remove the import",
      "✖ tests/functional/report.ts: ../../app/components/ReportCard.vue leaves tests/ for app/components/: no alias reaches it from here",
    ]);
  }, 60000);

  it("test:arch flags server code that reads the audit tables, and skips the schema file, tests and audit() writes", async () => {
    const fixtureCwd = scratchDir("arch-audit-reads");
    const files = {
      "server/utils/history.ts": 'import { auditLogTable } from "#nuxvel/schema";\n\nexport const history = () => useDb().select().from(auditLogTable);\n',
      "server/api/history.get.ts":
        'import { auditSubjectsTable } from "#nuxvel/schema";\n\nexport default defineEventHandler(() => useDb().select().from(auditSubjectsTable));\n',
      "server/trpc/routers/history.router.ts": 'export const subjects = schemaTable("audit_subjects");\n',
      "server/utils/raw.ts": "export const raw = () => useDb().execute(sql`select * from audit_context`);\n",
      "layers/shop/server/utils/history.ts": 'import { auditContextTable } from "#nuxvel/schema";\n\nexport const context = auditContextTable;\n',
      "layers/shop/nuxt.config.ts": "export default {};\n",
      "server/utils/namespace.ts": 'import * as schema from "#nuxvel/schema";\n\nexport const log = schema.auditLogTable;\n',
      "server/utils/raw-string.ts": 'export const raw = () => useDb().execute(sql.raw("select * from audit_subjects"));\n',
      "server/utils/raw-template.ts": "export const raw = () => useDb().execute(sql.raw(`delete from audit_log`));\n",
      "server/utils/raw-other.ts": 'export const raw = () => useDb().execute(sql.raw("select * from my_audit_log_view"));\n',
      "server/database/schema/audit-log.schema.ts":
        'import { pgTable, serial } from "drizzle-orm/pg-core";\n\nexport const auditLogTable = pgTable("audit_log", { id: serial("id").primaryKey() });\n',
      "server/utils/history.test.ts": 'import { auditLogTable } from "#nuxvel/schema";\n\nexport const count = auditLogTable;\n',
      "server/tests/history.ts": 'import { auditLogTable } from "#nuxvel/schema";\n\nexport const count = auditLogTable;\n',
      "server/utils/rename.ts":
        'export const rename = () => audit({ action: "post.renamed" }).then(() => useDb().execute(sql`select * from my_audit_log_view`));\n',
    };

    buildNuxtFixture(fixtureCwd);

    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(fixtureCwd, file)), { recursive: true });
      writeFileSync(join(fixtureCwd, file), content);
    }

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "test:arch");
    const message = "app code may not read the audit tables, the audit log is for compliance only: keep the history of a feature in its own table";

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(violationLines(stderr).sort()).toEqual([
      "✖ 8 architecture violations",
      `✖ layers/shop/server/utils/history.ts: ${message}`,
      `✖ server/api/history.get.ts: ${message}`,
      `✖ server/trpc/routers/history.router.ts: ${message}`,
      `✖ server/utils/history.ts: ${message}`,
      `✖ server/utils/namespace.ts: ${message}`,
      `✖ server/utils/raw-string.ts: ${message}`,
      `✖ server/utils/raw-template.ts: ${message}`,
      `✖ server/utils/raw.ts: ${message}`,
    ]);
  }, 60000);

  it("test:arch flags server code that writes the billing tables, and skips reads and tests", async () => {
    const fixtureCwd = scratchDir("arch-billing-writes");
    const files = {
      "server/utils/grant.ts":
        'import { billingSubscriptionsTable } from "@nuxvel/nuxt/database";\n\nexport const grant = (userId: string) => useDb().insert(billingSubscriptionsTable).values({ userId });\n',
      "server/utils/refund.ts":
        'import * as schema from "#nuxvel/schema";\n\nexport const refund = () => useDb().update(schema.billingPaymentsTable).set({ status: "refunded" });\n',
      "server/utils/clear.ts": 'export const clear = () => useDb().delete(schemaTable("billing_events"));\n',
      "layers/shop/server/utils/raw.ts": "export const raw = () => useDb().execute(sql`update billing_customers set livemode = true`);\n",
      "layers/shop/nuxt.config.ts": "export default {};\n",
      "server/utils/raw-string.ts": 'export const raw = () => useDb().execute(sql.raw("delete from billing_payments"));\n',
      "server/utils/read.ts":
        'import { billingPaymentsTable } from "@nuxvel/nuxt/database";\n\nexport const read = () => useDb().select().from(billingPaymentsTable).then(() => useDb().execute(sql`select * from billing_events`));\n',
      "server/utils/grant.test.ts":
        'import { billingSubscriptionsTable } from "@nuxvel/nuxt/database";\n\nexport const seed = () => useDb().insert(billingSubscriptionsTable);\n',
    };

    buildNuxtFixture(fixtureCwd);

    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(fixtureCwd, file)), { recursive: true });
      writeFileSync(join(fixtureCwd, file), content);
    }

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "test:arch");
    const message = "app code may not write the billing tables, nuxvel writes them from Stripe's events: change the subscription or the payment in Stripe";

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(violationLines(stderr).sort()).toEqual([
      "✖ 5 architecture violations",
      `✖ layers/shop/server/utils/raw.ts: ${message}`,
      `✖ server/utils/clear.ts: ${message}`,
      `✖ server/utils/grant.ts: ${message}`,
      `✖ server/utils/raw-string.ts: ${message}`,
      `✖ server/utils/refund.ts: ${message}`,
    ]);
  }, 60000);

  it("test:arch flags page HTML in a functional test, an expect import from vitest, Playwright or Storybook in a test or a story, and it.each or it() in a loop, a sign-up over HTTP outside a test, and a raw client of @nuxt/test-utils", async () => {
    const fixtureCwd = scratchDir("arch-tests");
    const files = {
      "tests/functional/pages.test.ts": [
        'import { actingAs, expect, guest } from "@nuxvel/nuxt/testing";',
        'import { $fetch, fetch } from "@nuxt/test-utils/e2e";',
        "",
        "export async function pages(path: string) {",
        '  await $fetch("/tickets");',
        "  await actingAs({ id: \"1\" }).$fetch(`/tickets/${path}`);",
        "  await guest().$fetch<string>(path);",
        '  const page = await fetch("/sign-in");',
        "  const html = await page.text();",
        '  const feed = await fetch(path, { headers: { accept: "text/html" } });',
        "  await feed.text();",
        "  expect(html).toContain(\"Sign in\");",
        "}",
        "",
      ].join("\n"),
      "tests/functional/allowed.test.ts": [
        'import { actingAs, getMeta, guest } from "@nuxvel/nuxt/testing";',
        "",
        "export async function allowed() {",
        '  await guest().$fetch("/api/health/ready");',
        '  await guest().$fetch<string>("/robots.txt");',
        '  await guest().$fetch<string>("/sitemap.xml");',
        '  await getMeta("/tickets");',
        '  const response = await guest().fetch("/tickets", { redirect: "manual" });',
        '  response.headers.get("location");',
        '  const api = await guest().fetch("/api/feed");',
        "  await api.text();",
        '  return actingAs({ id: "1" }).$fetch("/api/notifications");',
        "}",
        "",
      ].join("\n"),
      "server/utils/format.test.ts": 'import { expect, it } from "vitest";\n\nit("archives", () => expect(1).toBe(1));\n',
      "tests/e2e/home.test.ts":
        'import { expect } from "@playwright/test";\nimport { $fetch } from "@nuxt/test-utils/e2e";\n\nexport const home = async () => expect(await $fetch("/")).toBeTruthy();\n',
      "app/components/Card.stories.ts": 'import { expect, fn } from "storybook/test";\n\nexport const spy = fn(expect);\n',
      "layers/shop/tests/functional/cart.test.ts": 'import { $fetch } from "@nuxt/test-utils/e2e";\n\nexport const cart = () => $fetch("/cart");\n',
      "layers/shop/nuxt.config.ts": "export default {};\n",
      "tests/functional/cases.test.ts": [
        'import { expect } from "@nuxvel/nuxt/testing";',
        'import { it } from "vitest";',
        "",
        'it.each([1, 2])("counts %s", (n) => expect(n).toBeTruthy());',
        'for (const n of [1, 2]) it(`counts ${n}`, () => expect(n).toBeTruthy());',
        'it.for([1, 2])("counts %s", (n) => expect(n).toBeTruthy());',
        "",
      ].join("\n"),
      "tests/functional/session.test.ts": [
        'import { expect, guest } from "@nuxvel/nuxt/testing";',
        'import { it } from "vitest";',
        "",
        'export const signUp = (email: string) => guest().fetch("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ email }) });',
        "",
        'it("signs a new user up", async () => {',
        '  expect((await guest().fetch("/api/auth/sign-up/email", { method: "POST" })).status).toBe(200);',
        "});",
        "",
      ].join("\n"),
      "tests/e2e/raw.test.ts": [
        'import { createPage, url } from "@nuxt/test-utils/e2e";',
        "",
        'export const open = () => createPage(url("/"));',
        "",
      ].join("\n"),
    };

    buildNuxtFixture(fixtureCwd);

    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(fixtureCwd, file)), { recursive: true });
      writeFileSync(join(fixtureCwd, file), content);
    }

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "test:arch");
    const pageHtml =
      "reads the HTML of a page in a functional test: check what the page shows in a story play function (nuxvel test:ui) or with visit() (nuxvel test:e2e), and keep the status, redirect and data checks here";
    const expectImport = (from: string) =>
      `'expect' import from '${from}' is restricted. Import expect from @nuxvel/nuxt/testing in a test, or from @nuxvel/nuxt/storybook/test in a story.`;

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(violationLines(stderr).sort()).toEqual([
      "✖ 17 architecture violations",
      `✖ app/components/Card.stories.ts: ${expectImport("storybook/test")}`,
      "✖ layers/shop/tests/functional/cart.test.ts: $fetch from @nuxt/test-utils/e2e: use guest().$fetch or actingAs(user).$fetch",
      `✖ layers/shop/tests/functional/cart.test.ts: $fetch ${pageHtml}`,
      `✖ server/utils/format.test.ts: ${expectImport("vitest")}`,
      "✖ tests/e2e/home.test.ts: $fetch from @nuxt/test-utils/e2e: use guest().$fetch or actingAs(user).$fetch",
      `✖ tests/e2e/home.test.ts: ${expectImport("@playwright/test")}`,
      "✖ tests/e2e/raw.test.ts: createPage from @nuxt/test-utils/e2e: use visit() or actingAs(user).visit(), which record the errors of the page",
      "✖ tests/functional/cases.test.ts: Use it.for in place of it.each: it passes the case as one argument and keeps the test context",
      "✖ tests/functional/cases.test.ts: it() in a loop: write it once with it.for(cases), one case per line",
      "✖ tests/functional/pages.test.ts: $fetch from @nuxt/test-utils/e2e: use guest().$fetch or actingAs(user).$fetch",
      `✖ tests/functional/pages.test.ts: $fetch ${pageHtml}`,
      `✖ tests/functional/pages.test.ts: actingAs({ id: "1" }).$fetch ${pageHtml}`,
      `✖ tests/functional/pages.test.ts: feed.text() of fetch(path, { headers: { accept: "text/html" } }) ${pageHtml}`,
      "✖ tests/functional/pages.test.ts: fetch from @nuxt/test-utils/e2e: use guest().fetch or actingAs(user).fetch",
      `✖ tests/functional/pages.test.ts: guest().$fetch ${pageHtml}`,
      `✖ tests/functional/pages.test.ts: page.text() of fetch("/sign-in") ${pageHtml}`,
      "✖ tests/functional/session.test.ts: /api/auth/sign-up/email outside a test: create the user with a factory and reach the app with actingAs(user), or with signIn(email, password) to test a real session",
    ]);
  }, 60000);

  it("test:arch flags an action that calls requireAuth() or an auto-imported h3 request helper", async () => {
    const fixtureCwd = scratchDir("arch-request");

    buildNuxtFixture(fixtureCwd);
    const actions = {
      "require-auth.ts": "export const requireAuth = defineAction({ handler: async () => (await requireAuth()).user });\n",
      "use-event.ts": "export const useEvent = defineAction({ handler: () => useEvent().path });\n",
      "get-header.ts": 'export const getHeader = defineAction({ handler: () => getHeader(useEvent(), "x") });\n',
      "read-body.ts": "export const readBody = defineAction({ handler: (event) => readBody(event) });\n",
      "clean.ts": "export const clean = defineAction({ handler: (input, ctx) => ctx.actor.id });\n",
    };

    mkdirSync(join(fixtureCwd, "server", "actions", "widgets"), { recursive: true });

    for (const [file, content] of Object.entries(actions)) {
      writeFileSync(join(fixtureCwd, "server", "actions", "widgets", file), content);
    }

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "test:arch");

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");

    for (const file of ["require-auth.ts", "use-event.ts", "get-header.ts", "read-body.ts"]) {
      expect(stderr).toContain(`${file}: actions may not import h3, call auth() or requireAuth()`);
    }

    expect(violationLines(stderr).join("\n")).not.toContain("clean.ts");
    expect(stripAnsi(stderr)).toContain("✖ 4 architecture violations");
  }, 60000);

  it("test:arch warns about a definition file without the kind suffix, and keeps exit code 0", async () => {
    const fixtureCwd = scratchDir("arch-suffix");
    const files = {
      "jobs/post/notify.ts": "export default defineJob({ handler: () => {} });\n",
      "jobs/post/archive.job.ts": "export const archiveJob = defineJob({ handler: () => {} });\n",
      "jobs/post/notify.test.ts": "export {};\n",
      "jobs/types.d.ts": "export {};\n",
      "flags/beta.ts": "export default defineFlag({ default: false });\n",
      "trpc/routers/task.ts": "export default {};\n",
    };

    buildNuxtFixture(fixtureCwd);

    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(fixtureCwd, "server", file)), { recursive: true });
      writeFileSync(join(fixtureCwd, "server", file), content);
    }

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "test:arch");

    expect(exitCode, stderr).toBe(0);
    expect(stdout).toBe("");
    expect(stripAnsi(stderr).trimEnd().split("\n").sort()).toEqual([
      "▲ server/flags/beta.ts: add the kind suffix, rename it to beta.flag.ts or beta.experiment.ts",
      "▲ server/jobs/post/notify.ts: add the kind suffix, rename it to notify.job.ts",
      "▲ server/trpc/routers/task.ts: add the kind suffix, rename it to task.router.ts",
      "✔ All architecture rules pass",
    ]);
  }, 60000);

  it("key:rotate takes a provider-issued value from --value or stdin", async () => {
    const fixtureCwd = scratchDir("key-rotate-value");
    const readVar = (name: string) =>
      readFileSync(join(fixtureCwd, ".env"), "utf8").match(new RegExp(`^${name}=(.+)$`, "m"))?.[1];

    writeFileSync(join(fixtureCwd, ".env"), "NUXT_BILLING_WEBHOOK_SECRET=whsec_first\n");

    const fromFlag = await runCliAt(fixtureCwd, "key:rotate", "NUXT_BILLING_WEBHOOK_SECRET", "--value", "whsec_second");

    expect(fromFlag.exitCode).toBe(0);
    expect(readVar("NUXT_BILLING_WEBHOOK_SECRET")).toBe("whsec_second");
    expect(readVar("NUXT_BILLING_WEBHOOK_SECRET_PREVIOUS")).toBe("whsec_first");

    const fromStdin = await runCliWithInput(
      fixtureCwd,
      "whsec_third\n",
      process.env,
      "key:rotate",
      "NUXT_BILLING_WEBHOOK_SECRET",
      "--stdin",
    );

    expect(fromStdin.exitCode, fromStdin.output).toBe(0);
    expect(readVar("NUXT_BILLING_WEBHOOK_SECRET")).toBe("whsec_third");
    expect(readVar("NUXT_BILLING_WEBHOOK_SECRET_PREVIOUS")).toBe("whsec_second");

    const empty = await runCliWithInput(fixtureCwd, "\n", process.env, "key:rotate", "NUXT_BILLING_WEBHOOK_SECRET", "--stdin");

    expect(empty.exitCode).toBe(1);
    expect(stripAnsi(empty.stderr)).toContain("→ Pass it with --value, or as one line on stdin with --stdin");
    expect(readVar("NUXT_BILLING_WEBHOOK_SECRET")).toBe("whsec_third");
  });

  it("key:rotate refuses NUXT_AUDIT_CHAIN_SECRET", async () => {
    const fixtureCwd = scratchDir("key-rotate-audit-chain");
    const original = `NUXT_AUDIT_CHAIN_SECRET=${"ab".repeat(32)}\n`;

    writeFileSync(join(fixtureCwd, ".env"), original);

    const { exitCode, stderr } = await runCliAt(fixtureCwd, "key:rotate", "NUXT_AUDIT_CHAIN_SECRET");

    expect(exitCode).toBe(1);
    expect(stripAnsi(stderr)).toContain("✖ NUXT_AUDIT_CHAIN_SECRET cannot be rotated");
    expect(stripAnsi(stderr)).toContain("→ Keep it for the life of the audit log");
    expect(readFileSync(join(fixtureCwd, ".env"), "utf8")).toBe(original);
  });

  it("key:rotate refuses NUXT_OG_IMAGE_SECRET", async () => {
    const fixtureCwd = scratchDir("key-rotate-og-image");
    const original = `NUXT_OG_IMAGE_SECRET=${"ab".repeat(32)}\n`;

    writeFileSync(join(fixtureCwd, ".env"), original);

    const { exitCode, stderr } = await runCliAt(fixtureCwd, "key:rotate", "NUXT_OG_IMAGE_SECRET");

    expect(exitCode).toBe(1);
    expect(stripAnsi(stderr)).toContain("✖ NUXT_OG_IMAGE_SECRET cannot be rotated");
    expect(readFileSync(join(fixtureCwd, ".env"), "utf8")).toBe(original);
  });

  it("key:rotate refuses when the secret is not set", async () => {
    const fixtureCwd = scratchDir("key-rotate-missing");

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "key:rotate", "NUXT_AUTH_SECRET");

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stripAnsi(stderr)).toContain("✖ NUXT_AUTH_SECRET is not set, nothing to rotate");
    expect(stripAnsi(stderr)).toContain("→ Create it with nuxvel key:generate");
  });

  it("events lists the playground's events with their emitting actions and listeners, as a table or JSON", async () => {
    const appDir = scratchPlayground("events");
    const { stdout, stderr, exitCode } = await runCliAt(appDir, "events");
    const { header, rows } = tableRows(stdout);

    expect(exitCode).toBe(0);
    expect(header).toEqual(["EVENT", "SOURCE", "EMITTED BY", "LISTENERS"]);
    expect(rows).toContainEqual([
      "_probe.happened",
      "server/events/_probe/happened.ts",
      "server/actions/_probes/announce-probe.ts",
      "_record-probe-namespaced (sync), _record-probe-sync (sync)",
    ]);
    expect(rows).toContainEqual([
      "_probe.queued",
      "server/events/_probe/queued.ts",
      "server/actions/_probes/announce-queued-probe.ts",
      "_record-probe-queued (queued)",
    ]);
    expect(stderr).not.toContain("has no listener");

    const json = await runCliAt(appDir, "events", "--json");
    const { events } = JSON.parse(json.stdout);

    expect(json.exitCode).toBe(0);
    expect(events.map((event: { name: string; source: string }) => [event.name, event.source])).toEqual(
      rows.map((row) => row.slice(0, 2)),
    );
    expect(events).toContainEqual({
      name: "_probe.happened",
      source: "server/events/_probe/happened.ts",
      emitters: ["server/actions/_probes/announce-probe.ts"],
      listeners: [
        { name: "_record-probe-namespaced", sync: true },
        { name: "_record-probe-sync", sync: true },
      ],
    });
  }, 30000);

  it("events warns about an event nothing listens for and finds emitters anywhere in server code, through aliased imports", async () => {
    const fixtureCwd = scratchDir("events");

    buildNuxtFixture(fixtureCwd);
    mkdirSync(join(fixtureCwd, "server", "events", "widget"), { recursive: true });
    mkdirSync(join(fixtureCwd, "server", "listeners"), { recursive: true });
    mkdirSync(join(fixtureCwd, "server", "actions", "widgets"), { recursive: true });

    writeFileSync(
      join(fixtureCwd, "server", "events", "widget", "archived.ts"),
      'export const widgetArchived = defineEvent({\n  payload: z.object({ id: z.number() }),\n});\n',
    );
    writeFileSync(
      join(fixtureCwd, "server", "events", "widget", "created.ts"),
      'export const widgetCreated = defineEvent({\n  payload: z.object({ id: z.number() }),\n});\n',
    );
    writeFileSync(
      join(fixtureCwd, "server", "actions", "widgets", "create-widget.ts"),
      'import { widgetCreated } from "../../events/widget/created";\n\nexport const createWidget = defineAction({\n  handler: async () => emit(widgetCreated, { id: 1 }),\n});\n',
    );
    writeFileSync(
      join(fixtureCwd, "server", "listeners", "notify-widget-created.ts"),
      'import { widgetCreated } from "../events/widget/created";\n\nexport default defineListener({\n  event: widgetCreated,\n  handler: async () => {},\n});\n',
    );

    mkdirSync(join(fixtureCwd, "server", "jobs"), { recursive: true });
    writeFileSync(
      join(fixtureCwd, "server", "jobs", "rebuild-widgets.ts"),
      'import { widgetCreated as created } from "../events/widget/created";\n\nexport default defineJob({\n  handler: async () => emit(created, { id: 2 }),\n});\n',
    );
    mkdirSync(join(fixtureCwd, "modules"), { recursive: true });
    writeFileSync(
      join(fixtureCwd, "modules", "keep-tests.ts"),
      'import { defineNuxtModule } from "nuxt/kit";\n\nexport default defineNuxtModule({\n  setup(_options, nuxt) {\n    nuxt.options.ignore = nuxt.options.ignore.filter((pattern) => pattern !== "**/*.{spec,test}.{js,cts,mts,ts,jsx,tsx}");\n  },\n});\n',
    );
    writeFileSync(
      join(fixtureCwd, "server", "events", "widget", "archived.test.ts"),
      'export const widgetArchivedInTest = defineEvent({\n  payload: z.object({ id: z.number() }),\n});\n',
    );
    writeFileSync(
      join(fixtureCwd, "server", "actions", "widgets", "archive-widget.spec.ts"),
      'import { widgetArchived } from "../../events/widget/archived";\n\nexport const archiveWidget = defineAction({\n  handler: async () => emit(widgetArchived, { id: 1 }),\n});\n',
    );

    const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "events");
    const { rows } = tableRows(stdout);

    expect(exitCode).toBe(0);
    expect(rows.map(([name]) => name)).not.toContain("widget.archived.test");
    expect(rows).toContainEqual(["widget.archived", "server/events/widget/archived.ts", "nothing", "none"]);
    expect(rows).toContainEqual([
      "widget.created",
      "server/events/widget/created.ts",
      expect.stringMatching(/^(?=.*server\/actions\/widgets\/create-widget\.ts)(?=.*server\/jobs\/rebuild-widgets\.ts)/),
      "notify-widget-created (queued)",
    ]);
    expect(stripAnsi(stderr)).toContain("▲ widget.archived has no listener, nothing reacts to this event");
  });
});
