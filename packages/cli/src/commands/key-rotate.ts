import { text } from "node:stream/consumers";
import { defineCommand } from "citty";
import { rotateKey } from "../env/key-rotate.ts";
import { fail } from "../ui/fail.ts";
import { success } from "../ui/output.ts";

export default defineCommand({
  meta: {
    name: "key:rotate",
    description: "Rotate a secret in .env, keeping the previous value verifying for a grace period.",
  },
  args: {
    name: {
      type: "positional",
      description: "Name of the env var to rotate, e.g. NUXT_AUTH_SECRET.",
      required: true,
    },
    value: {
      type: "string",
      description: "The new value, for a secret your provider issues. Defaults to a strong random one.",
    },
    stdin: {
      type: "boolean",
      description: "Read the new value from stdin, keeping it out of your shell history.",
      default: false,
    },
  },
  async run({ args }) {
    if (args.name === "NUXT_AUDIT_CHAIN_SECRET") {
      fail("NUXT_AUDIT_CHAIN_SECRET cannot be rotated: the audit rows written under it would stop verifying", {
        hint: "Keep it for the life of the audit log",
      });
    }

    if (args.name === "NUXT_OG_IMAGE_SECRET") {
      fail("NUXT_OG_IMAGE_SECRET cannot be rotated: the image URLs in cached pages would stop working, and a previous value is not accepted", {
        hint: "To replace it, set a new value in .env and in shared/.env, then deploy",
      });
    }

    const value = args.stdin ? (await text(process.stdin)).trim() : args.value;

    if (value !== undefined && (value.length === 0 || /[\r\n]/.test(value))) {
      fail("The new value must be one non-empty line", { hint: "Pass it with --value, or as one line on stdin with --stdin" });
    }

    const rotated = rotateKey(process.cwd(), args.name, value);

    if (!rotated) {
      fail(`${args.name} is not set, nothing to rotate`, {
        hint: args.name === "NUXT_AUTH_SECRET" ? "Create it with nuxvel key:generate" : `Add ${args.name} to .env first`,
      });
    }

    success(`Rotated ${args.name}, the previous value keeps verifying until ${rotated.previousExpiresAt}`);
  },
});
