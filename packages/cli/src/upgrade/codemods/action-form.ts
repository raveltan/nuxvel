import { join } from "node:path";
import { definitionName, domainPatterns, procedureInputs } from "@nuxvel/nuxt/cli";
import { globSync } from "tinyglobby";
import type { Codemod } from "../codemod.ts";
import { ruleRewrite } from "../rule-rewrite.ts";
import { actionForm as rule } from "../rules/action-form.ts";

const IGNORE = ["**/*.d.ts", "**/*.test.ts", "**/*.spec.ts"];

function sharedInputs(cwd: string) {
  const server = join(cwd, "server");
  const files = (folder: string) =>
    globSync([`${folder}/**/*.ts`, ...domainPatterns(folder).map((pattern) => `domains/${pattern}`)], { cwd: server, absolute: true, ignore: IGNORE });
  const actionsDir = join(server, "actions");
  const actions = files("actions").map((file) => ({ file, name: definitionName(actionsDir, file) }));
  const routers = [{ dir: join(server, "trpc/routers"), files: files("trpc/routers") }];
  const schemas = globSync("shared/schemas/**/*.ts", { cwd, absolute: true, ignore: IGNORE });

  return new Map([...procedureInputs(routers, actions, schemas)].map(([path, { name }]) => [path, name]));
}

export const actionForm: Codemod = {
  name: "action-form",
  version: "0.3.0",
  description:
    "Rewrites useActionForm(schema, $api.<path>.mutationOptions(options), formOptions) to useActionForm($api.<path>, { ...options, ...formOptions }), keeping schema only when it is not the procedure's shared input schema",
  files: ["**/*.{ts,vue}"],
  rewrite(source, file, cwd) {
    if (!source.includes("useActionForm(")) return { output: source, manual: [] };
    const plugin = { meta: { name: "nuxvel-upgrade" }, rules: { "action-form": rule(sharedInputs(cwd)) } };

    return ruleRewrite("action-form", plugin)(source, file);
  },
};
