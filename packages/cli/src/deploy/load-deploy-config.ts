import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { loadEnvFile } from "../env/load-env-file.ts";
import { fail } from "../ui/fail.ts";
import { deployConfigSchema } from "./define-deploy.ts";

export const DEPLOY_CONFIG_FILE = "nuxvel.deploy.ts";

export async function loadDeployConfig(cwd: string) {
  const file = join(cwd, DEPLOY_CONFIG_FILE);

  if (!existsSync(file)) {
    fail(`${DEPLOY_CONFIG_FILE} not found in ${cwd}`, {
      hint: 'Create it with defineDeploy() from "@nuxvel/cli/deploy"',
    });
  }

  loadEnvFile(cwd, ".env.deploy");

  const module: { default?: unknown } = await import(pathToFileURL(file).href);
  const parsed = deployConfigSchema.safeParse(module.default);

  if (!parsed.success) fail(`${DEPLOY_CONFIG_FILE} is invalid:\n${z.prettifyError(parsed.error)}`);

  return parsed.data;
}
