import { camelCase } from "@nuxvel/nuxt/cli";
import type { Rule, Scope } from "eslint";
import { addDefinitionImports } from "./definition-imports.ts";
import type { DefinitionImport } from "./explicit-imports.ts";

type CallNode = Extract<Rule.Node, { type: "CallExpression" }>;

type Argument = CallNode["arguments"][number];

type Member = Extract<Argument, { type: "MemberExpression" }>;

type Chain = Argument | Member["object"];

interface Removed {
  namespace: string;
  method: string;
  definition: number;
  arguments: [number, number];
  example: string;
  suffix: string;
}

/** The folder of `server/` that holds the definitions of each `$<kind>` namespace root. */
export const REMOVED_NAMESPACES: Record<string, string> = {
  $jobs: "jobs",
  $channels: "channels",
  $mails: "mail",
  $events: "events",
  $notifications: "notifications",
};

const REMOVED: Record<string, Removed> = {
  dispatchAfterCommit: { namespace: "$jobs", method: "dispatch", definition: 0, arguments: [2, 3], example: "notifyFollowersJob.dispatch(input)", suffix: "Job" },
  broadcast: { namespace: "$channels", method: "broadcast", definition: 0, arguments: [3, 4], example: 'postsChannel.broadcast("created", payload)', suffix: "Channel" },
  broadcastAfterCommit: { namespace: "$channels", method: "broadcast", definition: 0, arguments: [3, 4], example: 'postsChannel.broadcast("created", payload)', suffix: "Channel" },
  sendMail: { namespace: "$mails", method: "send", definition: 0, arguments: [2, 3], example: "welcomeMail.send(input)", suffix: "Mail" },
  emit: { namespace: "$events", method: "emit", definition: 0, arguments: [2, 2], example: "postPublishedEvent.emit(payload)", suffix: "Event" },
  notify: { namespace: "$notifications", method: "notify", definition: 1, arguments: [3, 3], example: "welcomeNotification.notify(userId, data)", suffix: "Notification" },
};

function memberKeys(node: Chain): { root: string; keys: string[] } | undefined {
  if (node.type === "Identifier") return { root: node.name, keys: [] };
  if (node.type !== "MemberExpression" || node.computed || node.property.type !== "Identifier") return undefined;

  const parent = memberKeys(node.object);

  return parent && { root: parent.root, keys: [...parent.keys, node.property.name] };
}

function readsName(node: Member) {
  return !node.computed && node.property.type === "Identifier" && node.property.name === "name";
}

function stringValue(node: Argument | null | undefined) {
  return node?.type === "Literal" && typeof node.value === "string" ? node.value : undefined;
}

export function definitionMethods(
  renamedJobs: ReadonlySet<string>,
  namespaces: ReadonlyMap<string, ReadonlyMap<string, DefinitionImport>>,
): Rule.RuleModule {
  return {
    meta: {
      type: "problem",
      fixable: "code",
      docs: { description: "Rewrites dispatchAfterCommit(), broadcast(), broadcastAfterCommit(), sendMail(), emit() and notify() to the method of the definition, and imports the definition from its file." },
      messages: {
        method: "{{name}}() is removed: call {{method}}() on the definition",
        manual:
          "{{name}}() is removed: import the definition from its file and call {{method}}() on it, such as {{example}}, with the other arguments in the same order",
        renamed: '{{name}}() is removed, and "{{job}}" is a renamed() alias with no job file: call dispatch() on the job it renames',
        imports: "no longer auto-imported: import {{names}} from its file",
      },
      schema: [],
    },
    create(context) {
      const { sourceCode } = context;
      const { text } = sourceCode;

      if (!Object.keys(REMOVED).some((name) => text.includes(`${name}(`))) return {};

      const imports: DefinitionImport[] = [];

      function variableOf(node: Rule.Node, name: string) {
        for (let scope: Scope.Scope | null = sourceCode.getScope(node); scope; scope = scope.upper) {
          const variable = scope.set.get(name);
          if (variable?.defs.length) return variable;
        }

        return undefined;
      }

      function definitionName(call: CallNode, node: Argument) {
        const literal = stringValue(node);
        if (literal !== undefined || node.type !== "Identifier") return literal;

        const [definition] = variableOf(call, node.name)?.defs ?? [];
        if (definition?.type !== "Variable" || definition.parent.kind !== "const") return undefined;

        return stringValue(definition.node.init);
      }

      function definitionTarget(call: CallNode, removed: Removed, node: Argument): { name: string; definition?: DefinitionImport } | undefined {
        const leaves = namespaces.get(removed.namespace);
        const named = definitionName(call, node);
        if (named !== undefined) {
          const definition = leaves?.get(named.split(".").map(camelCase).join("."));

          return definition && { name: definition.name, definition };
        }
        if (node.type === "MemberExpression") {
          const path = memberKeys(node);
          if (!path || path.root !== removed.namespace || readsName(node)) return undefined;
          const definition = leaves?.get(path.keys.join("."));

          return definition && { name: definition.name, definition };
        }
        if (node.type !== "Identifier") return undefined;

        const [definition] = variableOf(call, node.name)?.defs ?? [];
        if (definition?.type === "ImportBinding") return node.name.endsWith(removed.suffix) ? { name: node.name } : undefined;
        if (definition?.type !== "Variable") return undefined;

        const { init } = definition.node;

        return init?.type === "CallExpression" && init.callee.type === "Identifier" && init.callee.name.startsWith("define") ? { name: node.name } : undefined;
      }

      return {
        CallExpression(call) {
          if (call.callee.type !== "Identifier" || !Object.hasOwn(REMOVED, call.callee.name)) return;
          const { name } = call.callee;
          const removed = REMOVED[name];
          if (!removed || variableOf(call, name)) return;

          const args = call.arguments;
          const [min, max] = removed.arguments;
          const definition = args[removed.definition];
          const job = removed.namespace === "$jobs" && definition ? definitionName(call, definition) : undefined;

          if (job !== undefined && renamedJobs.has(job)) {
            context.report({ node: call, messageId: "renamed", data: { name, job } });
            return;
          }

          const target =
            args.length >= min && args.length <= max && args.every((arg) => arg.type !== "SpreadElement") && definition
              ? definitionTarget(call, removed, definition)
              : undefined;

          if (!target || !definition) {
            context.report({ node: call, messageId: "manual", data: { name, method: removed.method, example: removed.example } });
            return;
          }
          if (target.definition) imports.push(target.definition);

          context.report({
            node: call,
            messageId: "method",
            data: { name, method: removed.method },
            fix: (fixer) => {
              const end = sourceCode.getRange(call)[1];
              const others = args.filter((arg) => arg !== definition).map((arg) => sourceCode.getRange(arg));
              const [first, second] = others;
              if (!first) return fixer.replaceText(call, `${target.name}.${removed.method}()`);

              const rest = removed.definition === 0 || !second ? text.slice(first[0], end) : `${text.slice(first[0], first[1])}, ${text.slice(second[0], end)}`;

              return fixer.replaceText(call, `${target.name}.${removed.method}(${rest}`);
            },
          });
        },
        "Program:exit"(program) {
          if (imports.length === 0) return;

          context.report({
            node: program,
            loc: { line: 1, column: 0 },
            messageId: "imports",
            data: { names: imports.map(({ name }) => name).join(", ") },
            fix: (fixer) => addDefinitionImports(fixer, program, imports),
          });
        },
      };
    },
  };
}
