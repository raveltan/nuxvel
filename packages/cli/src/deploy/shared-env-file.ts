import { createHash } from "node:crypto";
import { join } from "node:path";
import type { SshTarget } from "../server/run-over-ssh.ts";
import { runOverSsh } from "../server/run-over-ssh.ts";
import { deployScript } from "../server/deploy-script.ts";

export function localEnvFile(envName: string) {
  return join(".nuxvel", `${envName}.env`);
}

export function pulledHashFile(envName: string) {
  return join(".nuxvel", `${envName}.env.pulled`);
}

export function envHash(contents: string) {
  return createHash("sha256").update(contents).digest("hex");
}

export async function readSharedEnv(target: SshTarget, app: string) {
  const lines: string[] = [];
  await runOverSsh(target, deployScript("env", { APP: app, APP_DIR: `/srv/apps/${app}` }), (line) => lines.push(line), {
    failure: "Reading shared/.env failed",
  });

  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}
