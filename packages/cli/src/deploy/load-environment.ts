import { fail } from "../ui/fail.ts";
import { DEPLOY_CONFIG_FILE, loadDeployConfig } from "./load-deploy-config.ts";

export async function loadEnvironment(cwd: string, name: string) {
  const config = await loadDeployConfig(cwd);
  const environment = config.environments[name];

  if (!environment) {
    fail(`No environment "${name}" in ${DEPLOY_CONFIG_FILE}`, {
      hint: `Pick one of: ${Object.keys(config.environments).join(", ")}`,
      exitCode: 2,
    });
  }

  const [server] = environment.servers;
  if (!server) fail(`Environment "${name}" has no server`);

  return { app: config.app, environment, server };
}
