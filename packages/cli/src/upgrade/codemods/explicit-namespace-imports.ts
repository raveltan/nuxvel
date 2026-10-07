import type { Codemod } from "../codemod.ts";
import { ruleRewrite } from "../rule-rewrite.ts";
import { explicitNamespaceImports as rule } from "../rules/explicit-namespace-imports.ts";

export const explicitNamespaceImports: Codemod = {
  name: "explicit-namespace-imports",
  version: "0.3.0",
  description:
    'Imports $seeders from "#nuxvel/seeders-namespace" and $backfills from "#nuxvel/backfills-namespace" in each file that uses them, as they are no longer auto-imported',
  files: ["**/*.ts"],
  rewrite: ruleRewrite("explicit-namespace-imports", { meta: { name: "nuxvel-upgrade" }, rules: { "explicit-namespace-imports": rule } }),
};
