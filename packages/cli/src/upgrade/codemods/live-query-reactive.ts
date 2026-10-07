import type { Codemod } from "../codemod.ts";
import { ruleRewrite } from "../rule-rewrite.ts";
import { liveQueryReactive as rule } from "../rules/live-query-reactive.ts";

export const liveQueryReactive: Codemod = {
  name: "live-query-reactive",
  version: "0.3.0",
  description:
    "Removes .value after the fields of a const bound to useLiveQuery(), in script and template, and wraps a destructured useLiveQuery() in toRefs()",
  files: ["**/*.{ts,vue}"],
  rewrite: ruleRewrite("live-query-reactive", { meta: { name: "nuxvel-upgrade" }, rules: { "live-query-reactive": rule } }),
};
