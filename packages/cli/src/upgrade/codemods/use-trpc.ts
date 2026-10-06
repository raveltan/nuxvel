import type { Codemod } from "../codemod.ts";
import { ruleRewrite } from "../rule-rewrite.ts";
import { useTrpc as rule } from "../rules/use-trpc.ts";

export const useTrpc: Codemod = {
  name: "use-trpc",
  version: "0.3.0",
  description:
    "Replaces useTRPC() with the auto-imported $api, and each use of a const bound to useTRPC() with $api, and turns useQuery() and useMutation() of a procedure's options into its .useQuery() and .useMutation()",
  files: ["**/*.{ts,vue}"],
  rewrite: ruleRewrite("use-trpc", { meta: { name: "nuxvel-upgrade" }, rules: { "use-trpc": rule } }),
};
