import { readFileSync } from "node:fs";
import { join } from "node:path";
import { definitionName, domainPatterns } from "@nuxvel/nuxt/cli";
import { globSync } from "tinyglobby";
import type { Codemod } from "../codemod.ts";
import { ruleRewrite } from "../rule-rewrite.ts";
import { definitionMethods as rule } from "../rules/definition-methods.ts";

const REMOVED_CALLS = /\b(?:dispatchAfterCommit|broadcast|broadcastAfterCommit|sendMail|emit|notify)\(/;

const renamedByApp = new Map<string, Set<string>>();

function findRenamedJobs(cwd: string) {
  const server = join(cwd, "server");
  const files = globSync(["jobs/**/*.ts", ...domainPatterns("jobs").map((pattern) => `domains/${pattern}`)], {
    cwd: server,
    absolute: true,
    ignore: ["**/*.d.ts", "**/*.test.ts", "**/*.spec.ts"],
  });

  return new Set(files.filter((file) => readFileSync(file, "utf8").includes("renamed(")).map((file) => definitionName(join(server, "jobs"), file)));
}

function renamedJobs(cwd: string) {
  const found = renamedByApp.get(cwd) ?? findRenamedJobs(cwd);

  renamedByApp.set(cwd, found);

  return found;
}

export const definitionMethods: Codemod = {
  name: "definition-methods",
  version: "0.3.0",
  description:
    'Rewrites dispatchAfterCommit(), broadcast(), broadcastAfterCommit(), sendMail(), emit() and notify() to the method of the definition, such as $jobs.post.notifyFollowers.dispatch(input) for dispatchAfterCommit("post.notify-followers", input), and prints a call whose name it cannot map as a manual step',
  files: ["**/*.ts"],
  rewrite(source, file, cwd) {
    if (!REMOVED_CALLS.test(source)) return { output: source, manual: [] };
    const plugin = { meta: { name: "nuxvel-upgrade" }, rules: { "definition-methods": rule(renamedJobs(cwd)) } };

    return ruleRewrite("definition-methods", plugin)(source, file);
  },
};
