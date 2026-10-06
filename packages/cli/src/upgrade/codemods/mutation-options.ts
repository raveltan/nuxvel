import type { Codemod } from "../codemod.ts";
import { ruleRewrite } from "../rule-rewrite.ts";
import { mutationOptions as rule } from "../rules/mutation-options.ts";

export const mutationOptions: Codemod = {
  name: "mutation-options",
  version: "0.3.0",
  description:
    "Replaces toasted() and optimistic() with the toast and optimistic options of $api.<path>.mutationOptions(), and turns useMutation() of those options into .useMutation()",
  files: ["**/*.{ts,vue}"],
  rewrite: ruleRewrite("mutation-options", { meta: { name: "nuxvel-upgrade" }, rules: { "mutation-options": rule } }),
};
