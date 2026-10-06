import type { Codemod } from "../codemod.ts";
import { ruleRewrite } from "../rule-rewrite.ts";
import { presenceParams as rule } from "../rules/presence-params.ts";

export const presenceParams: Codemod = {
  name: "presence-params",
  version: "0.3.0",
  description:
    "Wraps an object literal room of usePresence(name, room) in the params option, usePresence(name, { params: room }), as useChannel() takes it, and prints any other second argument as a manual step",
  files: ["**/*.{ts,vue}"],
  rewrite: ruleRewrite("presence-params", { meta: { name: "nuxvel-upgrade" }, rules: { "presence-params": rule } }),
};
