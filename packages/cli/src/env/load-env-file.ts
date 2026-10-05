import { existsSync } from "node:fs";
import { join } from "node:path";

export function loadEnvFile(cwd: string, name = ".env") {
  const path = join(cwd, name);

  if (existsSync(path)) process.loadEnvFile(path);
}
