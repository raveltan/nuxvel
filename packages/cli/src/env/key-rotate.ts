import { generateSecret } from "./generate-secret.ts";
import { readEnvVar } from "./read-env-var.ts";
import { writeEnvVar } from "./write-env-var.ts";

const GRACE_PERIOD_DAYS = 30;

export function rotateKey(cwd: string, name: string, next = generateSecret(), now = new Date()) {
  const current = readEnvVar(cwd, name);
  if (!current) return null;

  const previousExpiresAt = new Date(
    now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  writeEnvVar(cwd, name, next);
  writeEnvVar(cwd, `${name}_PREVIOUS`, current);
  writeEnvVar(cwd, `${name}_PREVIOUS_EXPIRES_AT`, previousExpiresAt);

  return { previousExpiresAt };
}
