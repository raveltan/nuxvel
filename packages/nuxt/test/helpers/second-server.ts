import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { vi } from "vitest";
import { freePort } from "@nuxvel/test-helpers/free-port";
import { playgroundBuild } from "./playground";

function waitUntilLive(serverUrl: string, child: ChildProcess) {
  return vi.waitFor(
    async () => {
      if (child.exitCode !== null) throw new Error(`second server exited with ${child.exitCode}`);

      const response = await fetch(new URL("/api/health/live", serverUrl));
      if (!response.ok) throw new Error(`second server answered ${response.status}`);
    },
    { timeout: 30_000, interval: 100 },
  );
}

export async function startSecondServer(options: { env?: Record<string, string> } = {}) {
  const { outputDir } = playgroundBuild();
  const port = await freePort();
  const serverUrl = `http://127.0.0.1:${port}/`;
  const child = spawn("node", [join(outputDir, "server", "index.mjs")], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      NODE_ENV: "test",
      NUXT_STRIPE_SECRET_KEY: process.env.NUXT_STRIPE_SECRET_KEY || "sk_test_nuxvel",
      NUXT_STRIPE_WEBHOOK_SECRET: process.env.NUXT_STRIPE_WEBHOOK_SECRET || "whsec_nuxvel-test",
      ...options.env,
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let output = "";
  const messages: unknown[] = [];

  child.on("message", (message) => messages.push(message));

  child.stdout?.on("data", (chunk) => (output += String(chunk)));
  child.stderr?.on("data", (chunk) => (output += String(chunk)));

  try {
    await waitUntilLive(serverUrl, child);
  } catch (error) {
    child.kill("SIGKILL");
    throw error;
  }

  return {
    url: serverUrl,
    child,
    output: () => output,
    messages: () => messages,
    async stop() {
      if (child.exitCode !== null) return;

      const exited = once(child, "exit");

      child.kill("SIGTERM");
      await exited;
    },
  };
}
