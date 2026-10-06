import type { Codemod } from "../codemod.ts";
import { ruleRewrite } from "../rule-rewrite.ts";
import { durations as rule } from "../rules/durations.ts";

export const durations: Codemod = {
  name: "durations",
  version: "0.3.0",
  description:
    "Rewrites a number of seconds (the ttl of remember(), cachePut() and withLock(), the expiresIn of signedUrl()) or of milliseconds (the timeout and backoff of defineJob(), the delay of $jobs.<path>.dispatch()) to a duration object such as { minutes: 5 }, and prints any value it cannot compute as a manual step",
  files: ["**/*.{ts,vue}"],
  rewrite: ruleRewrite("durations", { meta: { name: "nuxvel-upgrade" }, rules: { durations: rule } }),
};
