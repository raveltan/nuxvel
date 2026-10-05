import type { NuxvelCommand } from "@nuxvel/nuxt/cli";
import { spawnSsh, sshTarget } from "../server/run-over-ssh.ts";
import { shellQuote } from "../server/shell-script.ts";
import { releaseEnv } from "./ecosystem.ts";
import { loadEnvironment } from "./load-environment.ts";

export const RESULT_FILE = "/dev/fd/3";

export async function liveRelease(cwd: string, envName: string) {
  const { app, server } = await loadEnvironment(cwd, envName);

  return { app, host: server.host, target: sshTarget(cwd, server) };
}

export async function runInRelease(
  release: Awaited<ReturnType<typeof liveRelease>>,
  command?: NuxvelCommand,
  options: { result?: boolean } = {},
) {
  const { app, target } = release;
  const folder = `/srv/apps/${app}`;
  const env = Object.entries(releaseEnv(app)).map(([key, value]) => `${key}='${value}'`);
  const argument = command ? ` ${shellQuote(JSON.stringify(command))}` : "";
  const redirect = options.result ? " 3>&1 1>&2" : "";
  const remote = `cd ${folder}/current && ${env.join(" ")} exec node --env-file=${folder}/shared/.env --env-file=${folder}/shared/owner.env .output/server/nuxvel/tinker.mjs${argument}${redirect}`;
  const ssh = spawnSsh(target, remote, {
    terminal: !command && process.stdin.isTTY === true,
    stdio: [command ? "ignore" : "inherit", options.result ? "pipe" : "inherit", "inherit"],
  });
  let stdout = "";
  ssh.child.stdout?.on("data", (chunk) => (stdout += String(chunk)));
  const code = await ssh.exited();

  return { code, stdout };
}
