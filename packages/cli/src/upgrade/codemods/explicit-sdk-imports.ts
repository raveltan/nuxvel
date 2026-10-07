import type { Codemod } from "../codemod.ts";
import { ruleRewrite } from "../rule-rewrite.ts";
import { explicitSdkImports as rule } from "../rules/explicit-sdk-imports.ts";

export const explicitSdkImports: Codemod = {
  name: "explicit-sdk-imports",
  version: "0.3.0",
  description:
    'Imports useS3() from "@nuxvel/nuxt/storage", useQueue() from "@nuxvel/nuxt/queue", useRedis() from "@nuxvel/nuxt/redis" and useStripe() from "@nuxvel/nuxt/billing" in each file that uses them, as they are no longer auto-imported',
  files: ["**/*.ts"],
  rewrite: ruleRewrite("explicit-sdk-imports", { meta: { name: "nuxvel-upgrade" }, rules: { "explicit-sdk-imports": rule } }),
};
