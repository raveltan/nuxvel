import { readFileSync } from "node:fs";
import { join } from "node:path";
import { definitionName, domainPatterns } from "@nuxvel/nuxt/cli";
import { globSync } from "tinyglobby";
import type { Codemod } from "../codemod.ts";
import { ruleRewrite } from "../rule-rewrite.ts";
import type { DefinitionImport } from "../rules/explicit-imports.ts";
import { definitionMethods as rule, REMOVED_NAMESPACES } from "../rules/definition-methods.ts";
import { namespaceDefinitions } from "./explicit-imports.ts";

const REMOVED_CALLS = /\b(?:dispatchAfterCommit|broadcast|broadcastAfterCommit|sendMail|emit|notify)\(/;

const renamedByApp = new Map<string, Set<string>>();
const namespacesByApp = new Map<string, ReadonlyMap<string, ReadonlyMap<string, DefinitionImport>>>();

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

function namespaces(cwd: string) {
  const cached = namespacesByApp.get(cwd);
  if (cached) return cached;
  const maps = new Map(Object.entries(REMOVED_NAMESPACES).map(([root, folder]) => [root, namespaceDefinitions(cwd, folder)] as const));

  namespacesByApp.set(cwd, maps);

  return maps;
}

export const definitionMethods: Codemod = {
  name: "definition-methods",
  version: "0.3.0",
  description:
    'Rewrites dispatchAfterCommit(), broadcast(), broadcastAfterCommit(), sendMail(), emit() and notify() to the method of the definition, such as notifyFollowersJob.dispatch(input) for dispatchAfterCommit("post.notify-followers", input), imports the definition from its file, and prints a call whose name it cannot map as a manual step',
  files: ["**/*.ts"],
  rewrite(source, file, cwd) {
    if (!REMOVED_CALLS.test(source)) return { output: source, manual: [] };
    const plugin = { meta: { name: "nuxvel-upgrade" }, rules: { "definition-methods": rule(renamedJobs(cwd), namespaces(cwd)) } };

    return ruleRewrite("definition-methods", plugin)(source, file);
  },
};
