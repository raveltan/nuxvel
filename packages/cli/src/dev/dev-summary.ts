import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadNuxtConfig } from "@nuxt/kit";
import { publishedPorts } from "../services/published-ports.ts";
import { isInteractive, report, style } from "../ui/output.ts";
import { portlessCli } from "./portless-invocation.ts";

type DevConfig = { nuxvel?: { api?: { openapi?: object; restPrefix?: string } } };
type Options = {
  cwd: string;
  config: DevConfig;
  nuxtArgs: string[];
  portlessName?: string;
  queue: boolean;
  services: boolean;
};

function portArg(nuxtArgs: string[]) {
  const index = nuxtArgs.findIndex((arg) => arg === "--port" || arg === "-p");
  if (index >= 0) return nuxtArgs[index + 1];
  return nuxtArgs.find((arg) => arg.startsWith("--port="))?.slice("--port=".length);
}

async function appUrl({ cwd, nuxtArgs, portlessName }: Options) {
  if (!portlessName) {
    return `http://localhost:${portArg(nuxtArgs) ?? process.env.PORT ?? process.env.NUXT_PORT ?? 3000}`;
  }

  const { stdout } = await promisify(execFile)(process.execPath, [portlessCli(), "get", portlessName], { cwd }).catch(
    () => ({ stdout: `https://${portlessName}.localhost` }),
  );
  return stdout.trim();
}

function storage() {
  const url = process.env.NUXT_STORAGE_URL;
  if (!url) return undefined;

  const { origin } = new URL(url);
  const bucket = process.env.NUXT_STORAGE_BUCKET;
  return bucket ? `${origin} (bucket ${bucket})` : origin;
}

export async function loadDevConfig(cwd: string) {
  // the nuxvel key reaches NuxtOptions only in the app's generated types, which the CLI never sees
  return (await loadNuxtConfig({ cwd }).catch(() => ({}))) as DevConfig;
}

function apiDocs({ nuxvel }: DevConfig, app: string) {
  if (!nuxvel?.api?.openapi) return undefined;

  return `${app}${nuxvel.api.restPrefix ?? "/api/v1"}/docs`;
}

export async function printDevSummary(options: Options) {
  const app = await appUrl(options);
  const port = options.services ? await publishedPorts(options.cwd) : () => undefined;
  const local = (published: number | undefined) => (published ? `http://localhost:${published}` : undefined);
  const mailpit = local(port("mailpit", 8025));
  const bugsink = local(port("bugsink", 8000));

  const rows: [string, string | undefined][] = [
    ["App", app],
    ["DevTools", `${app}/__nuxt_devtools__/client/`],
    ["API docs", apiDocs(options.config, app)],
    ["Postgres", process.env.NUXT_DATABASE_URL],
    ["Redis", process.env.NUXT_REDIS_URL],
    ["Mailpit", mailpit],
    ["Storage", storage()],
    ["Bugsink", bugsink],
    ["Queue", options.queue ? "runs inside the dev server" : "off (--no-queue)"],
  ];
  const shown = rows.filter((row): row is [string, string] => Boolean(row[1]));
  const width = Math.max(...shown.map(([name]) => name.length));
  const label = (text: string) => (isInteractive() ? style.dim(text) : text);

  report();
  for (const [name, value] of shown) report(`  ${label(name.padEnd(width))}  ${value}`);
  report();
  return app;
}
