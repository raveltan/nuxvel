import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, cpSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { promisify } from "node:util";
import { linkNodeModules, playgroundDir } from "./scratch.ts";

export function writeRedisCompose(dir: string, label: string, port: number) {
  writeFileSync(
    join(dir, "docker-compose.yml"),
    [
      `name: nuxvel-cli-${label}-${randomUUID().slice(0, 8)}`,
      "services:",
      "  redis:",
      "    image: redis:8",
      "    ports:",
      `      - "${port}:6379"`,
      "    healthcheck:",
      '      test: ["CMD", "redis-cli", "ping"]',
      "      interval: 2s",
      "      timeout: 3s",
      "      retries: 30",
      "",
    ].join("\n"),
  );
}

export async function composeStates(dir: string) {
  const { stdout } = await promisify(execFile)("docker", ["compose", "ps", "--all", "--format", "{{.State}}"], { cwd: dir });
  return stdout.trim().split("\n");
}

export function projectsConfig(testOptions: string) {
  return `import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    ${testOptions},
    projects: [
      { extends: true, test: { name: "functional", exclude: [...configDefaults.exclude, "**/tests/e2e/**"] } },
      { extends: true, test: { name: "e2e", include: ["**/tests/e2e/**/*.test.ts"] } },
    ],
  },
});
`;
}

export function writeTestFixture(fixtureDir: string, testBody: string) {
  linkNodeModules(fixtureDir);
  writeFileSync(
    join(fixtureDir, "vitest.config.ts"),
    projectsConfig('environment: "node"'),
  );
  writeFileSync(join(fixtureDir, "sample.test.ts"), testBody);
}

export function writeFakeTool(projectDir: string, name: string, script: string) {
  const packageDir = join(projectDir, "node_modules", name);
  const entry = join(packageDir, "cli.mjs");
  const binDir = join(projectDir, "node_modules", ".bin");

  mkdirSync(packageDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(packageDir, "package.json"), JSON.stringify({ name, bin: { [name]: "cli.mjs" } }));
  writeFileSync(entry, `#!/usr/bin/env node\n${script}\n`);
  chmodSync(entry, 0o755);
  symlinkSync(entry, join(binDir, name));
}

export function buildNuxtFixture(fixtureDir: string) {
  linkNodeModules(fixtureDir);
  cpSync(join(playgroundDir, "nuxt.config.ts"), join(fixtureDir, "nuxt.config.ts"));
}

export function buildServerFixture(fixtureDir: string) {
  buildNuxtFixture(fixtureDir);
  cpSync(join(playgroundDir, "server/database/schema"), join(fixtureDir, "server/database/schema"), {
    recursive: true,
  });
}

export const bootEnv = {
  ...process.env,
  NUXT_DATABASE_URL: "postgres://nuxvel:nuxvel@localhost:5432/unused",
  NUXT_AUTH_SECRET: "cli-test-secret-cli-test-secret-cli-test",
};

export async function startStubApp(options: { csp: boolean; healthStatus: number; sse: "streamed" | "buffered" }) {
  const server = createServer((request, response) => {
    if (request.url === "/api/channels/flags") {
      response.writeHead(200, { "content-type": "text/event-stream" });
      if (options.sse === "streamed") response.write('event: connected\ndata: {}\n\n');
      return;
    }

    if (request.url?.startsWith("/api/health/")) {
      response.writeHead(options.healthStatus, { "content-type": "application/json" });
      response.end("{}");
      return;
    }

    response.writeHead(200, {
      "content-type": "text/html",
      ...(options.csp ? { "content-security-policy": "default-src 'self'" } : {}),
    });
    response.end("<!doctype html>");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
