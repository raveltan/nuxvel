import type { Codemod } from "../codemod.ts";
import { ruleRewrite } from "../rule-rewrite.ts";
import { testClientApi as rule } from "../rules/test-client-api.ts";

export const testClientApi: Codemod = {
  name: "test-client-api",
  version: "0.3.0",
  description:
    "Renames trpc of the test client of actingAs(), guest() and signIn() to api: .trpc on the client or a const bound to it becomes .api, and a destructured trpc becomes api, or api: trpc when the file uses the name api",
  files: ["**/*.ts"],
  rewrite: ruleRewrite("test-client-api", { meta: { name: "nuxvel-upgrade" }, rules: { "test-client-api": rule } }),
};
