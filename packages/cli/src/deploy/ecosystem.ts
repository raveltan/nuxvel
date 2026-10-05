import { PROCESS_MB } from "./process-counts.ts";

export type Color = "blue" | "green";

export function releaseEnv(app: string) {
  return {
    NODE_ENV: "production",
    NUXT_NUXVEL_SECURITY_TRUST_PROXY: "loopback",
    NUXT_ERASURE_LOG_COMMAND: `sudo -n /usr/local/lib/nuxvel/erasure ${app}`,
  };
}

export function ecosystemFile(options: {
  app: string;
  folder: string;
  color: Color;
  port: number;
  processes: { web: number; worker: number };
  databasePoolMax: number;
}) {
  const cwd = `${options.folder}/${options.color}`;
  const shared = {
    script: `${cwd}/.output/server/index.mjs`,
    cwd,
    node_args: `--env-file=${options.folder}/shared/.env`,
    max_memory_restart: `${PROCESS_MB}M`,
  };
  const env = {
    ...releaseEnv(options.app),
    HOST: "127.0.0.1",
    NUXT_DATABASE_POOL_MAX: String(options.databasePoolMax),
  };
  const apps = [
    {
      name: `${options.app}-web-${options.color}`,
      ...shared,
      exec_mode: "cluster",
      instances: options.processes.web,
      wait_ready: true,
      listen_timeout: 15000,
      kill_timeout: 10000,
      env: { ...env, PORT: String(options.port) },
    },
    {
      name: `${options.app}-worker-${options.color}`,
      ...shared,
      exec_mode: "fork",
      instances: options.processes.worker,
      increment_var: "PORT",
      kill_timeout: 30000,
      env: { ...env, PORT: String(options.port + 1), NUXVEL_ROLE: "worker" },
    },
  ].filter((app) => app.instances > 0);

  return `module.exports = ${JSON.stringify({ apps }, null, 2)};\n`;
}
