import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function writeEnvVar(cwd: string, name: string, value: string): void {
  const path = join(cwd, ".env");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";

  const lines = existing.length > 0 ? existing.split(/\r?\n/) : [];
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const index = lines.findIndex((line) => line.startsWith(`${name}=`));
  const newLine = `${name}=${value}`;

  if (index >= 0) {
    lines[index] = newLine;
  } else {
    lines.push(newLine);
  }

  writeFileSync(path, `${lines.join("\n")}\n`);
}
