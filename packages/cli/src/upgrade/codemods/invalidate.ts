import type { Codemod } from "../codemod.ts";
import { ruleRewrite } from "../rule-rewrite.ts";
import { invalidate as rule } from "../rules/invalidate.ts";

export const invalidate: Codemod = {
  name: "invalidate",
  version: "0.3.0",
  description:
    "Removes a hand-written invalidateQueries() of the mutation's own namespace from the onSuccess and onSettled of a mutation, which the client now invalidates after every mutation",
  files: ["**/*.{ts,vue}"],
  rewrite: ruleRewrite("invalidate", { meta: { name: "nuxvel-upgrade" }, rules: { invalidate: rule } }),
};
