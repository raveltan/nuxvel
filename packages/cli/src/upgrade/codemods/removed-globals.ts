import type { Codemod } from "../codemod.ts";
import { ruleRewrite } from "../rule-rewrite.ts";
import { removedGlobals as rule } from "../rules/removed-globals.ts";

export const removedGlobals: Codemod = {
  name: "removed-globals",
  version: "0.3.0",
  description:
    'Replaces SYSTEM_ACTOR_TYPE with "system" and API_KEY_ACTOR_TYPE with "api-key", and the server auth() with useAuth() where only its .user is read, and prints any other auth() as a manual step',
  files: ["**/*.ts"],
  rewrite: ruleRewrite("removed-globals", { meta: { name: "nuxvel-upgrade" }, rules: { "removed-globals": rule } }),
};
