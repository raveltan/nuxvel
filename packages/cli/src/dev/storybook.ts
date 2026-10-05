import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { portlessCli } from "./portless-invocation.ts";

async function freePort() {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  await once(server, "close");
  return typeof address === "object" && address ? address.port : undefined;
}

export async function storybookPort(cwd: string, enabled: boolean | undefined) {
  if (enabled === false || !existsSync(join(cwd, ".storybook"))) return undefined;
  return freePort();
}

export function portlessSkipped() {
  return ["0", "false", "skip"].includes(process.env.PORTLESS ?? "");
}

export function aliasStorybook(cwd: string, appName: string, port: number) {
  const alias = `storybook.${appName}`;
  const portless = (args: string[]) => execFileSync(process.execPath, [portlessCli(), "alias", ...args], { cwd, stdio: "ignore" });

  portless([alias, String(port), "--force"]);
  process.once("exit", () => {
    try {
      portless(["--remove", alias]);
    } catch {}
  });
}
