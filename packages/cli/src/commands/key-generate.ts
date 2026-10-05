import { defineCommand } from "citty";
import { generateKey } from "../env/key-generate.ts";
import { fail } from "../ui/fail.ts";
import { success } from "../ui/output.ts";

export default defineCommand({
  meta: {
    name: "key:generate",
    description: "Write a strong random NUXT_AUTH_SECRET into .env, unless one is already set.",
  },
  run() {
    const cwd = process.cwd();
    const secret = generateKey(cwd, "NUXT_AUTH_SECRET");

    if (!secret) {
      fail("NUXT_AUTH_SECRET is already set, refusing to overwrite it", {
        hint: "To replace it, run nuxvel key:rotate NUXT_AUTH_SECRET",
      });
    }

    success("Wrote NUXT_AUTH_SECRET to .env");
  },
});
