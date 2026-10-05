import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

function packageName(cwd: string) {
  try {
    const { name }: { name?: unknown } = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
    return typeof name === "string" && name ? name : undefined;
  } catch {
    return undefined;
  }
}

function hostnameLabel(name: string) {
  return name
    .replace(/^@[^/]+\//, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function portlessCli() {
  return fileURLToPath(new URL("cli.js", import.meta.resolve("portless")));
}

export function portlessInvocation(cwd: string, nuxtArgs: string[]) {
  const name = hostnameLabel(packageName(cwd) ?? basename(cwd)) || "app";

  return {
    name,
    args: [portlessCli(), "--name", name, "nuxt", "dev", ...nuxtArgs],
  };
}
