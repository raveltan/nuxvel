import * as clack from "@clack/prompts";
import { fail } from "../ui/fail.ts";

const RECOVERY_KEY_ENV = "NUXVEL_RECOVERY_KEY";

export async function askRecoveryKey(command: string) {
  const fromEnv = process.env[RECOVERY_KEY_ENV];
  if (fromEnv) return fromEnv.trim();
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    fail(`${command} needs the recovery key, and there is no terminal to ask for it`, { hint: `Set ${RECOVERY_KEY_ENV}` });
  }

  const key = await clack.password({
    message: "Recovery key (AGE-SECRET-KEY-1...), shown by the first server:setup",
    output: process.stderr,
    validate: (value) => (/^AGE-SECRET-KEY-1[0-9A-Z]+$/.test(value?.trim() ?? "") ? undefined : "An age secret key starts with AGE-SECRET-KEY-1"),
  });
  if (clack.isCancel(key)) fail(`${command} needs the recovery key`);

  return key.trim();
}
