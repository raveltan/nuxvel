import { createECDH } from "node:crypto";
import { defineCommand } from "citty";
import { readEnvVar } from "../env/read-env-var.ts";
import { writeEnvVar } from "../env/write-env-var.ts";
import { fail } from "../ui/fail.ts";
import { success } from "../ui/output.ts";

const PUBLIC_KEY = "NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY";
const PRIVATE_KEY = "NUXT_PUSH_VAPID_PRIVATE_KEY";
const PRIVATE_KEY_BYTES = 32;

export default defineCommand({
  meta: {
    name: "push:keys",
    description: "Write a new VAPID key pair for web push into .env, unless one is already set.",
  },
  run() {
    const cwd = process.cwd();
    const alreadySet = [PUBLIC_KEY, PRIVATE_KEY].filter((name) => readEnvVar(cwd, name));

    if (alreadySet.length > 0) {
      fail(`${alreadySet.join(" and ")} already set, refusing to overwrite`, {
        hint: "New keys end every push subscription. To replace them anyway, delete both lines from .env first",
      });
    }

    const keys = createECDH("prime256v1");
    keys.generateKeys();
    const privateKey = keys.getPrivateKey();

    writeEnvVar(cwd, PUBLIC_KEY, keys.getPublicKey("base64url"));
    writeEnvVar(
      cwd,
      PRIVATE_KEY,
      Buffer.concat([Buffer.alloc(PRIVATE_KEY_BYTES - privateKey.length), privateKey]).toString("base64url"),
    );

    success(`Wrote ${PUBLIC_KEY} and ${PRIVATE_KEY} to .env`);
  },
});
