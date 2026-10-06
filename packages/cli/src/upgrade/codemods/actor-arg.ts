import type { Codemod } from "../codemod.ts";
import { ruleRewrite } from "../rule-rewrite.ts";
import { actorArg as rule } from "../rules/actor-arg.ts";

export const actorArg: Codemod = {
  name: "actor-arg",
  version: "0.3.0",
  description:
    "Removes the actor argument of can(), authorize() and canMany() when it is ctx.actor or actor, which they now read from the running procedure, action or job, and prints any other actor as a manual step",
  files: ["**/*.{ts,vue}"],
  rewrite: ruleRewrite("actor-arg", { meta: { name: "nuxvel-upgrade" }, rules: { "actor-arg": rule } }),
};
