import { generateSecret } from "./generate-secret.ts";
import { readEnvVar } from "./read-env-var.ts";
import { writeEnvVar } from "./write-env-var.ts";

export function generateKey(cwd: string, name: string): string | null {
  if (readEnvVar(cwd, name)) return null;

  const secret = generateSecret();
  writeEnvVar(cwd, name, secret);
  return secret;
}
