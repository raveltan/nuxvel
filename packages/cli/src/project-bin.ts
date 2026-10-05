import { readFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";

function readBinField(packageJson: string): unknown {
  try {
    const manifest: { bin?: unknown } = JSON.parse(readFileSync(packageJson, "utf8"));
    return manifest.bin;
  } catch {
    return undefined;
  }
}

function binEntry(packageJson: string, bin: string) {
  const field = readBinField(packageJson);
  const entry: unknown = typeof field === "object" && field !== null ? Reflect.get(field, bin) : field;

  return typeof entry === "string" ? entry : undefined;
}

export function resolveProjectBin(cwd: string, bin: string) {
  for (let dir = cwd; ; dir = dirname(dir)) {
    const packageDir = join(dir, "node_modules", bin);
    const entry = binEntry(join(packageDir, "package.json"), bin);
    if (entry) return join(packageDir, entry);
    if (dirname(dir) === dir) return undefined;
  }
}

export function withProjectBinPath(cwd: string, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const key = Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  const localBin = join(cwd, "node_modules", ".bin");

  return { ...env, [key]: env[key] ? `${localBin}${delimiter}${env[key]}` : localBin };
}
