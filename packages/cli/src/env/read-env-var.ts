import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function readEnvVar(cwd: string, name: string): string | null {
  const path = join(cwd, ".env");
  if (!existsSync(path)) return null;

  const line = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .find((line) => line.startsWith(`${name}=`));

  if (!line) return null;

  const value = line.slice(name.length + 1).trim();
  return value.length > 0 ? value : null;
}
