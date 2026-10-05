import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TraceMap, generatedPositionFor } from "@jridgewell/trace-mapping";
import { describe, expect, it, onTestFinished } from "vitest";
import { runAppTests } from "./helpers/app.ts";
import { composeStates, projectsConfig, writeFakeTool, writeRedisCompose, writeTestFixture } from "./helpers/fixtures.ts";
import { scratchDatabase } from "./helpers/database.ts";
import { execFileAsync, runBinAt, runCliAt, runCliWithEnv, stripAnsi } from "./helpers/run.ts";
import { waitFor } from "./helpers/services.ts";
import { nodeOnlyPath, outsideRepoDir, repoNodeModules, scratchDir, scratchPlayground } from "./helpers/scratch.ts";
import { startCli } from "@nuxvel/test-helpers/cli";
import { freePort } from "@nuxvel/test-helpers/free-port";

describe("nuxvel test", () => {
  it("test matches vitest's own exit code for a passing suite", async () => {
    const fixtureCwd = scratchDir("pass");

    writeTestFixture(
      fixtureCwd,
      'import { expect, it } from "vitest";\n\nit("passes", () => {\n  expect(1).toBe(1);\n});\n',
    );

    const nuxvelResult = await runCliAt(fixtureCwd, "test");
    const vitestResult = await runBinAt(fixtureCwd, "vitest", ["run"]);

    expect(nuxvelResult.exitCode).toBe(vitestResult.exitCode);
    expect(nuxvelResult.exitCode).toBe(0);
  });

  it("test passes extra arguments through to vitest, running only the named file", async () => {
    const fixtureCwd = scratchDir("args");

    writeTestFixture(
      fixtureCwd,
      'import { expect, it } from "vitest";\n\nit("passes", () => {\n  expect(1).toBe(1);\n});\n',
    );
    writeFileSync(
      join(fixtureCwd, "failing.test.ts"),
      'import { expect, it } from "vitest";\n\nit("fails", () => {\n  expect(1).toBe(2);\n});\n',
    );

    const { stdout, exitCode } = await runCliAt(fixtureCwd, "test", "sample.test.ts");

    expect(exitCode, stdout).toBe(0);
    expect(stripAnsi(stdout)).toMatch(/Test Files\s+1 passed \(1\)/);
  });

  it("test leaves tests/e2e/ out, and test:e2e runs only tests/e2e/", async () => {
    const fixtureCwd = scratchDir("e2e");
    const passing = (name: string) =>
      `import { expect, it } from "vitest";\n\nit("${name}", () => {\n  expect(1).toBe(1);\n});\n`;

    writeTestFixture(fixtureCwd, passing("functional"));
    mkdirSync(join(fixtureCwd, "tests", "e2e"), { recursive: true });
    writeFileSync(join(fixtureCwd, "tests", "e2e", "home.test.ts"), passing("end-to-end"));

    const functional = await runCliAt(fixtureCwd, "test", "--reporter=verbose");
    const e2e = await runCliAt(fixtureCwd, "test:e2e", "--reporter=verbose");

    expect(functional.exitCode, functional.stdout).toBe(0);
    expect(stripAnsi(functional.stdout)).toContain("sample.test.ts > functional");
    expect(stripAnsi(functional.stdout)).not.toContain("end-to-end");
    expect(e2e.exitCode, e2e.stdout).toBe(0);
    expect(stripAnsi(e2e.stdout)).toContain("home.test.ts > end-to-end");
    expect(stripAnsi(e2e.stdout)).not.toContain("> functional");
  });

  it("an e2e test in layers/<name>/tests/e2e/ runs under test:e2e, not under test", async () => {
    const fixtureCwd = scratchDir("e2e-layer");
    const layerE2e = join(fixtureCwd, "layers", "billing", "tests", "e2e");

    writeTestFixture(fixtureCwd, 'import { it } from "vitest";\n\nit("functional", () => {});\n');
    mkdirSync(layerE2e, { recursive: true });
    writeFileSync(join(layerE2e, "invoice.test.ts"), 'import { it } from "vitest";\n\nit("layer end-to-end", () => {});\n');

    const functional = await runCliAt(fixtureCwd, "test", "--reporter=verbose");
    const e2e = await runCliAt(fixtureCwd, "test:e2e", "--reporter=verbose");

    expect(functional.exitCode, functional.stdout).toBe(0);
    expect(stripAnsi(functional.stdout)).not.toContain("layer end-to-end");
    expect(e2e.exitCode, e2e.stdout).toBe(0);
    expect(stripAnsi(e2e.stdout)).toContain("layer end-to-end");
    expect(stripAnsi(e2e.stdout)).not.toContain("> functional");
  });

  it("test:e2e --headed, --devtools and --debug give vitest NUXVEL_HEADED, NUXVEL_DEVTOOLS and PWDEBUG in place of the flags", async () => {
    const fixtureCwd = scratchDir("e2e-debug");
    mkdirSync(join(fixtureCwd, "tests", "e2e"), { recursive: true });
    writeTestFixture(fixtureCwd, 'import { it } from "vitest";\n\nit("functional", () => {});\n');
    writeFileSync(
      join(fixtureCwd, "tests", "e2e", "debug.test.ts"),
      'import { expect, it } from "vitest";\n\nit("sees the debug variables", () => {\n  expect([process.env.NUXVEL_HEADED, process.env.NUXVEL_DEVTOOLS, process.env.PWDEBUG]).toEqual(["1", "1", "1"]);\n  expect(process.argv.join(" ")).not.toMatch(/--headed|--devtools|--debug/);\n});\n',
    );

    const { stdout, exitCode } = await runCliWithEnv(
      fixtureCwd,
      { ...process.env, NUXVEL_HEADED: "", NUXVEL_DEVTOOLS: "", PWDEBUG: "" },
      "test:e2e",
      "--headed",
      "--devtools",
      "--debug",
      "--reporter=verbose",
    );

    expect(exitCode, stdout).toBe(0);
    expect(stripAnsi(stdout)).toContain("debug.test.ts > sees the debug variables");
  });

  it("the test setup launches the browser headed, slowed down and with DevTools, and turns the timeouts off under PWDEBUG", async () => {
    const appDir = scratchPlayground("test-debug-browser");
    mkdirSync(join(appDir, "tests", "functional"), { recursive: true });
    writeFileSync(
      join(appDir, "tests", "functional", "debug.test.ts"),
      [
        'import { useTestContext } from "@nuxt/test-utils/e2e";',
        'import { expect, it } from "vitest";',
        "",
        'it("reads the debug variables", ({ task }) => {',
        '  expect(useTestContext().options.browserOptions).toEqual({ type: "chromium", launch: { headless: false, slowMo: 50, args: ["--auto-open-devtools-for-tabs"] } });',
        "  expect(task.timeout).toBe(0);",
        "});",
        "",
      ].join("\n"),
    );

    const result = await runAppTests(appDir, ["tests/functional/debug.test.ts"], { NUXVEL_DEVTOOLS: "1", NUXVEL_SLOW_MO: "50", PWDEBUG: "1" });

    expect(result.exitCode, result.stdout).toBe(0);
  }, 300000);

  it("test starts the dev services before running the suite and stops them after it", async () => {
    const fixtureCwd = scratchDir("services");
    const port = await freePort();
    const compose = [
      `name: nuxvel-cli-services-${randomUUID().slice(0, 8)}`,
      "services:",
      "  redis:",
      "    image: redis:8",
      '    command: ["redis-server"]',
      "    ports:",
      `      - "${port}:6379"`,
      "    healthcheck:",
      '      test: ["CMD", "redis-cli", "ping"]',
      "      interval: 2s",
      "      timeout: 3s",
      "      retries: 30",
      "",
    ].join("\n");

    const composeDown = async () => {
      await execFileAsync("docker", ["compose", "down", "-v"], { cwd: fixtureCwd }).catch(
        () => undefined,
      );
    };

    try {
      writeTestFixture(
        fixtureCwd,
        [
          'import { connect } from "node:net";',
          'import { expect, it } from "vitest";',
          "",
          'it("reaches the service the CLI started", async () => {',
          "  const reachable = await new Promise((resolve) => {",
          `    const socket = connect(${port}, "127.0.0.1");`,
          '    socket.on("connect", () => {',
          "      socket.end();",
          "      resolve(true);",
          "    });",
          '    socket.on("error", () => resolve(false));',
          "  });",
          "",
          "  expect(reachable).toBe(true);",
          "});",
          "",
        ].join("\n"),
      );
      writeFileSync(join(fixtureCwd, "docker-compose.yml"), compose);
      await composeDown();

      const { stdout, stderr, exitCode } = await runCliAt(fixtureCwd, "test");

      expect(stripAnsi(stderr)).toContain("◇ Started dev services (docker compose)");
      expect(stripAnsi(stderr)).toContain("◇ Stopping dev services (docker compose)");
      expect(exitCode, stdout + stderr).toBe(0);
      expect(await composeStates(fixtureCwd)).toEqual(["exited"]);
    } finally {
      await composeDown();
    }
  }, 180000);

  it("services up, status and down control the services, test skips compose when they are healthy, and recreates them without stopping them when the compose file changed", async () => {
    const fixtureCwd = scratchDir("services");
    const port = await freePort();
    const project = `nuxvel-cli-services-${randomUUID().slice(0, 8)}`;
    const composeYml = (published: number) =>
      [
        `name: ${project}`,
        "services:",
        "  redis:",
        "    image: redis:8",
        "    ports:",
        `      - "${published}:6379"`,
        "    healthcheck:",
        '      test: ["CMD", "redis-cli", "ping"]',
        "      interval: 2s",
        "      timeout: 3s",
        "      retries: 30",
        "",
      ].join("\n");

    writeTestFixture(
      fixtureCwd,
      'import { expect, it } from "vitest";\n\nit("passes", () => {\n  expect(1).toBe(1);\n});\n',
    );
    writeFileSync(join(fixtureCwd, "docker-compose.yml"), composeYml(port));

    try {
      const up = await runCliAt(fixtureCwd, "services", "up");
      expect(up.exitCode, up.stderr).toBe(0);
      expect(stripAnsi(up.stderr)).toContain("◇ Started dev services (docker compose)");

      const healthy = await runCliAt(fixtureCwd, "services", "status");
      expect(healthy.exitCode, healthy.stderr).toBe(0);
      expect(stripAnsi(healthy.stdout)).toContain("✔ redis  healthy");

      const suite = await runCliAt(fixtureCwd, "test");
      expect(suite.exitCode, suite.stdout + suite.stderr).toBe(0);
      expect(stripAnsi(suite.stderr)).toContain("◇ Dev services are already healthy (docker compose)");
      expect(stripAnsi(suite.stderr)).not.toContain("Started dev services");
      expect(stripAnsi(suite.stderr)).not.toContain("Stopping dev services");
      expect(await composeStates(fixtureCwd)).toEqual(["running"]);

      const movedPort = await freePort();
      writeFileSync(join(fixtureCwd, "docker-compose.yml"), composeYml(movedPort));
      const updated = await runCliAt(fixtureCwd, "test");
      expect(updated.exitCode, updated.stdout + updated.stderr).toBe(0);
      expect(stripAnsi(updated.stderr)).toContain("◇ Updated dev services to the compose file (docker compose)");
      expect(stripAnsi(updated.stderr)).not.toContain("Stopping dev services");
      expect(await composeStates(fixtureCwd)).toEqual(["running"]);
      const { stdout: published } = await execFileAsync("docker", ["compose", "port", "redis", "6379"], { cwd: fixtureCwd });
      expect(published.trim()).toMatch(new RegExp(`:${movedPort}$`));

      const down = await runCliAt(fixtureCwd, "services", "down");
      expect(down.exitCode, down.stderr).toBe(0);
      expect(stripAnsi(down.stderr)).toContain("◇ Stopped dev services (docker compose)");

      const stopped = await runCliAt(fixtureCwd, "services", "status");
      expect(stopped.exitCode).toBe(1);
      expect(stripAnsi(stopped.stdout)).toContain("✖ redis  not created");
    } finally {
      await execFileAsync("docker", ["compose", "down", "-v"], { cwd: fixtureCwd }).catch(() => undefined);
    }
  }, 180000);

  it("services up without docker gives a hint that does not say it continues, and exits 1", async () => {
    const fixtureCwd = scratchDir("services-no-docker");

    writeFileSync(join(fixtureCwd, "docker-compose.yml"), "services:\n  redis:\n    image: redis:8\n");

    const { stderr, exitCode } = await runCliWithEnv(
      fixtureCwd,
      { ...process.env, PATH: nodeOnlyPath(fixtureCwd) },
      "services",
      "up",
    );

    expect(exitCode).toBe(1);
    expect(stripAnsi(stderr)).toContain("✖ docker is not installed");
    expect(stripAnsi(stderr)).toContain("→ Install Docker Desktop");
    expect(stripAnsi(stderr)).not.toContain("continuing");
  });

  it("services rejects an unknown action", async () => {
    const { stderr, exitCode } = await runCliAt(scratchDir("services-usage"), "services", "restart");

    expect(exitCode).toBe(2);
    expect(stripAnsi(stderr)).toContain('✖ Unknown action "restart"');
  });

  it("test says so instead of crashing when vitest is not installed", async () => {
    const fixtureCwd = outsideRepoDir("no-vitest");

    const { stderr, exitCode } = await runCliWithEnv(fixtureCwd, { PATH: `${nodeOnlyPath(fixtureCwd)}:/usr/bin:/bin` }, "test");

    expect(stripAnsi(stderr)).toContain("✖ Could not run vitest");
    expect(stripAnsi(stderr)).toContain("→ Install it in this project (npm i -D vitest)");
    expect(exitCode).toBe(1);
  }, 30000);

  it("test says docker is missing, with a hint, and still runs the suite", async () => {
    const fixtureCwd = scratchDir("no-docker");

    writeTestFixture(
      fixtureCwd,
      'import { expect, it } from "vitest";\n\nit("passes", () => {\n  expect(1).toBe(1);\n});\n',
    );
    writeFileSync(join(fixtureCwd, "docker-compose.yml"), "services: {}\n");

    const { stdout, stderr, exitCode } = await runCliWithEnv(
      fixtureCwd,
      { ...process.env, PATH: nodeOnlyPath(fixtureCwd) },
      "test",
    );

    expect(stripAnsi(stderr)).toContain("✖ docker is not installed");
    expect(stripAnsi(stderr)).toContain("→ Install Docker Desktop, or start the services yourself");
    expect(stdout).not.toContain("docker is not installed");
    expect(exitCode, stdout + stderr).toBe(0);
  }, 30000);

  it("test matches vitest's own exit code for a failing suite", async () => {
    const fixtureCwd = scratchDir("fail");

    writeTestFixture(
      fixtureCwd,
      'import { expect, it } from "vitest";\n\nit("fails", () => {\n  expect(1).toBe(2);\n});\n',
    );

    const nuxvelResult = await runCliAt(fixtureCwd, "test");
    const vitestResult = await runBinAt(fixtureCwd, "vitest", ["run"]);

    expect(nuxvelResult.exitCode).toBe(vitestResult.exitCode);
    expect(nuxvelResult.exitCode).not.toBe(0);
    expect(stripAnsi(nuxvelResult.stderr)).toContain(`✖ vitest exited with code ${vitestResult.exitCode}`);
  });

  it("test exits 128 + the signal's number, with a ✖ line, when vitest is killed", async () => {
    const fixtureCwd = scratchDir("killed");

    writeFakeTool(fixtureCwd, "vitest", 'process.kill(process.pid, "SIGKILL");');

    const { stderr, exitCode } = await runCliAt(fixtureCwd, "test");

    expect(exitCode).toBe(137);
    expect(stripAnsi(stderr)).toContain("✖ vitest was killed by SIGKILL");
  });

  it("test runs vitest from its package when the project has no node_modules/.bin/vitest", async () => {
    const fixtureCwd = outsideRepoDir("no-bin-link");

    mkdirSync(join(fixtureCwd, "node_modules"));
    symlinkSync(join(repoNodeModules, "vitest"), join(fixtureCwd, "node_modules", "vitest"));
    writeFileSync(join(fixtureCwd, "vitest.config.mjs"), 'export default { test: { environment: "node", projects: [{ extends: true, test: { name: "functional" } }] } };\n');
    writeFileSync(
      join(fixtureCwd, "sample.test.ts"),
      'import { expect, it } from "vitest";\n\nit("passes", () => {\n  expect(1).toBe(1);\n});\n',
    );

    const { stdout, stderr, exitCode } = await runCliWithEnv(
      fixtureCwd,
      { ...process.env, PATH: nodeOnlyPath(fixtureCwd) },
      "test",
    );

    expect(exitCode, stdout + stderr).toBe(0);
    expect(stripAnsi(stdout)).toMatch(/Test Files\s+1 passed \(1\)/);
  }, 30000);

  it("the test global setup reuses the test build until a server file changes", async () => {
    const appDir = scratchPlayground("test-build-cache");
    const testFile = join(appDir, "tests", "functional", "home.test.ts");
    const writeTest = (title: string) =>
      writeFileSync(
        testFile,
        `import { $fetch } from "@nuxt/test-utils/e2e";\nimport { describe, expect, it, onTestFinished } from "vitest";\n\ndescribe("home", () => {\n  it("${title}", async () => {\n    expect(await $fetch<string>("/")).toContain("<html");\n  });\n});\n`,
      );
    const run = async (env: Record<string, string> = {}) => {
      const result = await runAppTests(appDir, [], env);
      expect(result.exitCode, result.stdout).toBe(0);
      return stripAnsi(result.stdout);
    };

    mkdirSync(join(appDir, "tests", "functional"), { recursive: true });
    writeTest("renders the home page");
    expect(await run()).toMatch(/◇ Built the app for tests: .+ \(\d+\.\ds\)/);
    const cacheDir = join(appDir, "node_modules", ".cache", "nuxvel", "test");
    const outputs = readdirSync(cacheDir)
      .map((key) => join(cacheDir, key, "build", "output"))
      .filter((dir) => existsSync(dir))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    const serverDir = join(`${outputs[0]}`, "server");
    expect(existsSync(join(serverDir, "node_modules"))).toBe(false);
    const actionMaps = readdirSync(serverDir, { recursive: true })
      .map(String)
      .filter((file) => file.endsWith(".map"))
      .map((file) => new TraceMap(readFileSync(join(serverDir, file), "utf8")))
      .flatMap((map) => {
        const source = map.sources.find((path) => path?.endsWith("server/actions/posts/editor-mode.action.ts"));
        return source ? [generatedPositionFor(map, { source, line: 5, column: 2 })] : [];
      });
    expect(actionMaps).toEqual([expect.objectContaining({ line: expect.any(Number) })]);

    writeTest("renders the home page again");
    expect(await run()).toMatch(/◇ Using the test build from /);

    expect(await run({ NUXVEL_CHANGES_DIR: scratchDir("test-build-cache-changes") })).toMatch(/◇ Using the test build from /);
    expect(await run()).toMatch(/◇ Using the test build from /);

    appendFileSync(join(appDir, "server", "utils", "_probe-named.ts"), "\nexport const buildMarker = 1;\n");
    expect(await run()).toMatch(/◇ Built the app for tests: server\/utils\/_probe-named\.ts changed \(\d+\.\ds\)/);
  }, 300000);

  it("the test database setup gives parallel test files their own database, empty at the start of every test", async () => {
    const appDir = scratchPlayground("test-database");
    const signUpTest = [
      'import { $fetch } from "@nuxt/test-utils/e2e";',
      'import { expectCount } from "@nuxvel/nuxt/testing";',
      'import { describe, it } from "vitest";',
      'import { userTable } from "../../server/database/schema/auth.schema";',
      "",
      'describe("sign-up", () => {',
      '  for (const title of ["first", "second"]) {',
      "    it(title, async () => {",
      "      await expectCount(userTable, 0);",
      '      await $fetch("/api/auth/sign-up/email", {',
      '        method: "POST",',
      '        body: { name: "Same", email: "same@example.com", password: "correct-horse-battery-staple" },',
      "      });",
      "      await expectCount(userTable, 1);",
      "    });",
      "  }",
      "});",
      "",
    ].join("\n");

    mkdirSync(join(appDir, "tests", "functional"), { recursive: true });
    writeFileSync(join(appDir, "tests", "functional", "a.test.ts"), signUpTest);
    writeFileSync(join(appDir, "tests", "functional", "b.test.ts"), signUpTest);

    const result = await runAppTests(appDir, []);

    expect(result.exitCode, result.stdout).toBe(0);
    expect(stripAnsi(result.stdout)).toMatch(/Tests\s+4 passed \(4\)/);
  }, 300000);

  it("the test database setup gives parallel test files their own Redis database, empty at the start of every test", async () => {
    const appDir = scratchPlayground("test-redis");
    const flagTest = [
      'import { runAction, setFlagTargeting } from "@nuxvel/nuxt/testing";',
      'import { describe, expect, it, onTestFinished } from "vitest";',
      'import { userFactory } from "../../server/factories/users.factory";',
      "",
      'describe("rollout", () => {',
      '  for (const title of ["first", "second"]) {',
      "    it(title, async () => {",
      "      const author = await userFactory();",
      '      const before = await runAction("posts.editor-mode", {}, { actingAs: author });',
      '      await setFlagTargeting("probe-rollout", { percentage: 100 });',
      '      const after = await runAction("posts.editor-mode", {}, { actingAs: author });',
      "      expect([before.rollout, after.rollout]).toEqual([false, true]);",
      "    });",
      "  }",
      "});",
      "",
    ].join("\n");

    mkdirSync(join(appDir, "tests", "functional"), { recursive: true });
    writeFileSync(join(appDir, "tests", "functional", "a.test.ts"), flagTest);
    writeFileSync(join(appDir, "tests", "functional", "b.test.ts"), flagTest);

    const result = await runAppTests(appDir, []);

    expect(result.exitCode, result.stdout).toBe(0);
    expect(stripAnsi(result.stdout)).toMatch(/Tests\s+4 passed \(4\)/);
  }, 300000);

  it("the changes reporter records per test file the app files that it ran", async () => {
    const appDir = scratchPlayground("test-changes");
    const actionsDir = join(appDir, "server", "actions", "changes");
    const testsDir = join(appDir, "tests", "functional");
    const changesDir = join(appDir, ".changes");

    mkdirSync(actionsDir, { recursive: true });
    mkdirSync(testsDir, { recursive: true });
    mkdirSync(changesDir);
    for (const name of ["first", "second"]) {
      writeFileSync(
        join(actionsDir, `${name}.action.ts`),
        `import { z } from "zod";\n\nexport const ${name}Action = defineAction({\n  input: z.object({}),\n  handler: async () => ({ name: "${name}" }),\n});\n`,
      );
      writeFileSync(
        join(testsDir, `${name}.test.ts`),
        `import { runAction } from "@nuxvel/nuxt/testing";\nimport { describe, expect, it, onTestFinished } from "vitest";\nimport { userFactory } from "../../server/factories/users.factory";\n\ndescribe("${name}", () => {\n  it("runs", async () => {\n    const actingAs = await userFactory();\n    expect(await runAction("changes.${name}", {}, { actingAs })).toEqual({ name: "${name}" });\n  });\n});\n`,
      );
    }

    const result = await runAppTests(appDir, ["--reporter=default", "--reporter=@nuxvel/nuxt/testing/changes-reporter"], {
      NUXVEL_CHANGES_DIR: changesDir,
    });

    expect(result.exitCode, result.stdout).toBe(0);
    const changes = JSON.parse(readFileSync(join(appDir, "node_modules", ".cache", "nuxvel", "changes.json"), "utf8"));
    const first = "server/actions/changes/first.action.ts";
    const second = "server/actions/changes/second.action.ts";
    expect(changes.map["tests/functional/first.test.ts"]).toContain(first);
    expect(changes.map["tests/functional/first.test.ts"]).not.toContain(second);
    expect(changes.map["tests/functional/second.test.ts"]).toContain(second);
    expect(changes.map["tests/functional/second.test.ts"]).not.toContain(first);
    expect(changes.hashes[first]).toMatch(/^[0-9a-f]{40}$/);
    expect(changes.failed).toEqual([]);
    expect(readdirSync(changesDir)).toEqual([]);
  }, 300000);

  it("test --help shows vitest's own help instead of nuxvel's", async () => {
    const fixtureCwd = scratchDir("help");

    writeTestFixture(fixtureCwd, "");

    const { stdout, exitCode } = await runCliAt(fixtureCwd, "test", "--help");

    expect(exitCode).toBe(0);
    expect(stripAnsi(stdout)).toContain("$ vitest run");
    expect(stripAnsi(stdout)).not.toContain("nuxvel test");
  }, 30000);
});

function changesFixture(label: string) {
  const dir = outsideRepoDir(label);

  mkdirSync(join(dir, "node_modules"));
  symlinkSync(join(repoNodeModules, "vitest"), join(dir, "node_modules", "vitest"));
  symlinkSync(join(repoNodeModules, "@nuxvel"), join(dir, "node_modules", "@nuxvel"));
  writeFileSync(
    join(dir, "vitest.config.ts"),
    projectsConfig('environment: "node", setupFiles: ["@nuxvel/nuxt/testing/setup"]'),
  );
  for (const name of ["first", "second"]) {
    writeFileSync(join(dir, `${name}.ts`), `export const ${name} = 1;\n`);
    writeFileSync(
      join(dir, `${name}.test.ts`),
      `import { expect, it } from "vitest";\nimport { ${name} } from "./${name}";\n\nit("${name}", () => {\n  expect(${name}).toBe(1);\n});\n`,
    );
  }

  return dir;
}

async function testChangesOnly(dir: string, env: Record<string, string> = {}) {
  const { stdout, stderr, exitCode } = await runCliWithEnv(dir, { ...process.env, CI: "", ...env }, "test", "--changes-only");
  return { output: stripAnsi(stdout + stderr), exitCode };
}

function readChanges(dir: string) {
  return JSON.parse(readFileSync(join(dir, "node_modules", ".cache", "nuxvel", "changes.json"), "utf8"));
}

describe("nuxvel test --changes-only", () => {
  it("runs all test files when there is no record of a previous run, and records the run", async () => {
    const dir = changesFixture("changes-no-record");

    const result = await testChangesOnly(dir);

    expect(result.exitCode, result.output).toBe(0);
    expect(result.output).toContain("Run all test files: there is no record of a previous run");
    expect(result.output).toMatch(/Test Files\s+2 passed \(2\)/);
    expect(readChanges(dir).map).toEqual({ "first.test.ts": ["first.ts"], "second.test.ts": ["second.ts"] });
  }, 60000);

  it("runs all test files when CI is set", async () => {
    const dir = changesFixture("changes-ci");
    await testChangesOnly(dir);

    const result = await testChangesOnly(dir, { CI: "1" });

    expect(result.output).toContain("Run all test files: CI is set");
    expect(result.output).toMatch(/Test Files\s+2 passed \(2\)/);
  }, 60000);

  it("runs all test files when a config file changes", async () => {
    const dir = changesFixture("changes-config");
    await testChangesOnly(dir);
    writeFileSync(join(dir, ".env"), "NUXT_EXAMPLE=1\n");

    const result = await testChangesOnly(dir);

    expect(result.output).toContain("Run all test files: .env changed");
    expect(result.output).toMatch(/Test Files\s+2 passed \(2\)/);
  }, 60000);

  it("runs all test files when a file that no test ran changes", async () => {
    const dir = changesFixture("changes-unknown");
    await testChangesOnly(dir);
    writeFileSync(join(dir, "third.ts"), "export const third = 1;\n");

    const result = await testChangesOnly(dir);

    expect(result.output).toContain("Run all test files: third.ts changed and no test ran it");
    expect(result.output).toMatch(/Test Files\s+2 passed \(2\)/);
  }, 60000);

  it("runs only the test files whose recorded files changed, and keeps the map entries of the others", async () => {
    const dir = changesFixture("changes-recorded");
    await testChangesOnly(dir);
    writeFileSync(join(dir, "first.ts"), "export const first = 1;\nexport const unused = 2;\n");

    const changed = await testChangesOnly(dir);
    const unchanged = await testChangesOnly(dir);

    expect(changed.exitCode, changed.output).toBe(0);
    expect(changed.output).toContain("Test files replayed as passed: 1. Test files to run: 1.");
    expect(changed.output).toMatch(/Test Files\s+1 passed \(1\)/);
    expect(readChanges(dir).map).toEqual({ "first.test.ts": ["first.ts"], "second.test.ts": ["second.ts"] });
    expect(unchanged.exitCode, unchanged.output).toBe(0);
    expect(unchanged.output).toContain("Test files replayed as passed: 2. Test files to run: 0.");
    expect(unchanged.output).not.toContain("Test Files");
  }, 60000);

  it("runs new and changed test files and the failures of the last run", async () => {
    const dir = changesFixture("changes-tests");
    writeFileSync(join(dir, "second.ts"), "export const second = 2;\n");
    await testChangesOnly(dir);
    writeFileSync(join(dir, "third.test.ts"), 'import { expect, it } from "vitest";\n\nit("third", () => {\n  expect(3).toBe(3);\n});\n');

    const result = await testChangesOnly(dir);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Test files replayed as passed: 1. Test files to run: 2.");
    expect(result.output).toMatch(/Test Files\s+1 failed \| 1 passed \(2\)/);
    expect(readChanges(dir).failed).toEqual(["second.test.ts"]);
  }, 60000);
});

describe("nuxvel test --watch", () => {
  it("runs only the test file that ran a changed file, then waits again", async () => {
    const dir = changesFixture("changes-watch");
    const watch = startCli(dir, ["test", "--watch"], { env: { ...process.env, CI: "" } });
    const output = () => stripAnsi(watch.output());
    const waiting = "Wait for file changes.";

    try {
      await waitFor(async () => (output().includes(waiting) ? true : undefined));
      const start = output().length;
      writeFileSync(join(dir, "first.ts"), "export const first = 1;\nexport const unused = 2;\n");
      await waitFor(async () => (output().slice(start).includes(waiting) ? true : undefined));
      const rerun = output().slice(start);

      expect(output().slice(0, start)).toMatch(/Test Files\s+2 passed \(2\)/);
      expect(rerun).toContain("Test files replayed as passed: 1. Test files to run: 1.");
      expect(rerun).toMatch(/Test Files\s+1 passed \(1\)/);
      expect(rerun).toContain("first.test.ts");
      expect(rerun).not.toContain("second.test.ts");
    } finally {
      await watch.stop("SIGINT");
    }
  }, 60000);

  it("starts one run for an atomic save", async () => {
    const dir = changesFixture("changes-watch-atomic");
    const watch = startCli(dir, ["test", "--watch"], { env: { ...process.env, CI: "" } });
    const output = () => stripAnsi(watch.output());
    const waiting = "Wait for file changes.";

    try {
      await waitFor(async () => (output().includes(waiting) ? true : undefined));
      const start = output().length;
      writeFileSync(join(dir, "first.ts.tmp"), "export const first = 1;\nexport const unused = 2;\n");
      renameSync(join(dir, "first.ts.tmp"), join(dir, "first.ts"));
      await waitFor(async () => (output().slice(start).includes(waiting) ? true : undefined));

      expect(output().slice(start).match(/Test files replayed as passed/g)).toHaveLength(1);
    } finally {
      await watch.stop("SIGINT");
    }
  }, 60000);

  it("stops the dev services it started when Ctrl-C ends the wait", async () => {
    const dir = changesFixture("changes-watch-services");
    writeRedisCompose(dir, "watch-services", await freePort());
    onTestFinished(() => execFileAsync("docker", ["compose", "down", "-v"], { cwd: dir }).then(() => undefined, () => undefined));
    const watch = startCli(dir, ["test", "--watch"], { env: { ...process.env, CI: "" } });
    const output = () => stripAnsi(watch.output());
    const exited = new Promise((resolve) => watch.child.on("exit", (code, signal) => resolve(signal ?? code)));

    await waitFor(async () => (output().includes("Wait for file changes.") ? true : undefined), 120000);
    await watch.stop("SIGINT");

    expect(await exited).toBe("SIGINT");
    expect(output()).toContain("◇ Stopping dev services (docker compose)");
    expect(await composeStates(dir)).toEqual(["exited"]);
  }, 180000);
});

const COMPAT_TEST = `import { runMigrations } from "@nuxvel/nuxt/migrations";
import postgres from "postgres";
import { expect, it } from "vitest";

it("lists the post titles", async () => {
  const sql = postgres(process.env.NUXT_DATABASE_URL ?? "", { max: 1, onnotice: () => {} });

  try {
    await sql.unsafe("drop schema if exists drizzle cascade; drop schema public cascade; create schema public");
    await runMigrations(sql, { migrationsFolder: "server/database/migrations", contract: true });
    await sql\`insert into posts (title) values ('Hello')\`;
    expect(await sql\`select title from posts\`).toEqual([{ title: "Hello" }]);
  } finally {
    await sql.end();
  }
});
`;

function writeMigrations(appDir: string, migrations: [tag: string, statement: string][]) {
  const dir = join(appDir, "server", "database", "migrations");
  const entries = migrations.map(([tag], idx) => ({ idx, version: "7", when: 1_700_000_000_000 + idx, tag, breakpoints: true }));

  mkdirSync(join(dir, "meta"), { recursive: true });
  writeFileSync(join(dir, "meta", "_journal.json"), JSON.stringify({ version: "7", dialect: "postgresql", entries }));
  for (const [tag, statement] of migrations) writeFileSync(join(dir, `${tag}.sql`), statement);
}

describe("nuxvel test:compat", () => {
  it("runs the tests of the live release against the new expand migrations, and fails when one drops a column it reads", async () => {
    const appDir = scratchDir("compat");
    const env = { ...process.env, NUXT_DATABASE_URL: await scratchDatabase("compat") };
    const git = (...args: string[]) =>
      execFileAsync("git", ["-c", "user.name=nuxvel", "-c", "user.email=nuxvel@example.com", ...args], { cwd: appDir });
    const posts: [string, string] = ["0000_posts", 'CREATE TABLE "posts" ("id" serial PRIMARY KEY, "title" text NOT NULL);'];
    const body: [string, string] = ["0001_post_body", 'ALTER TABLE "posts" ADD COLUMN "body" text;'];

    writeTestFixture(appDir, COMPAT_TEST);
    writeFileSync(join(appDir, ".gitignore"), "node_modules\n");
    writeMigrations(appDir, [posts]);
    await git("init", "--quiet");
    await git("add", ".");
    await git("commit", "--quiet", "-m", "live release");

    writeMigrations(appDir, [posts, body]);
    const expand = await runCliWithEnv(appDir, env, "test:compat", "--against=HEAD");
    expect(expand.exitCode, expand.stdout + expand.stderr).toBe(0);
    expect(stripAnsi(expand.stdout + expand.stderr)).toContain("The tests of HEAD pass against the new migrations");

    mkdirSync(join(appDir, "server", "database", "migrations", "contract"));
    writeFileSync(join(appDir, "server", "database", "migrations", "contract", "0001_post_body.sql"), 'ALTER TABLE "posts" DROP COLUMN "title";');
    const deferred = await runCliWithEnv(appDir, env, "test:compat", "--against=HEAD");
    expect(deferred.exitCode, deferred.stdout + deferred.stderr).toBe(0);
    expect(existsSync(join(appDir, "server", "database", "migrations", "contract", "0001_post_body.sql"))).toBe(true);

    writeMigrations(appDir, [posts, body, ["0002_drop_title", 'ALTER TABLE "posts" DROP COLUMN "title";']]);
    const contract = await runCliWithEnv(appDir, env, "test:compat", "--against=HEAD");
    expect(contract.exitCode, contract.stdout + contract.stderr).toBe(1);
    expect(stripAnsi(contract.stdout + contract.stderr)).toContain("The tests of HEAD fail against the new migrations");

    const unknown = await runCliWithEnv(appDir, env, "test:compat", "--against=no-such-ref");
    expect(unknown.exitCode).toBe(1);
    expect(stripAnsi(unknown.stdout + unknown.stderr)).toContain("Could not check out no-such-ref");
  }, 60000);
});
