import type { Rule, Scope } from "eslint";

type CallNode = Extract<Rule.Node, { type: "CallExpression" }>;

type Argument = CallNode["arguments"][number];

interface Removed {
  namespace: string;
  method: string;
  definition: number;
  arguments: [number, number];
  example: string;
  suffix: string;
}

const REMOVED: Record<string, Removed> = {
  dispatchAfterCommit: { namespace: "$jobs", method: "dispatch", definition: 0, arguments: [2, 3], example: "$jobs.post.notifyFollowers.dispatch(input)", suffix: "Job" },
  broadcast: { namespace: "$channels", method: "broadcast", definition: 0, arguments: [3, 4], example: '$channels.posts.broadcast("created", payload)', suffix: "Channel" },
  broadcastAfterCommit: { namespace: "$channels", method: "broadcast", definition: 0, arguments: [3, 4], example: '$channels.posts.broadcast("created", payload)', suffix: "Channel" },
  sendMail: { namespace: "$mails", method: "send", definition: 0, arguments: [2, 3], example: "$mails.welcome.send(input)", suffix: "Mail" },
  emit: { namespace: "$events", method: "emit", definition: 0, arguments: [2, 2], example: "$events.post.published.emit(payload)", suffix: "Event" },
  notify: { namespace: "$notifications", method: "notify", definition: 1, arguments: [3, 3], example: "$notifications.welcome.notify(userId, data)", suffix: "Notification" },
};

const SEGMENT = /^[a-z_$][\w$-]*$/i;

function namespacePath(namespace: string, name: string) {
  const segments = name.split(".");
  if (!segments.every((segment) => SEGMENT.test(segment) && !segment.endsWith("-"))) return undefined;

  return [namespace, ...segments.map((segment) => segment.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase()))].join(".");
}

function rootOf(node: Extract<Argument, { type: "MemberExpression" }>): string | undefined {
  const { object } = node;
  if (object.type === "Identifier") return object.name;

  return object.type === "MemberExpression" ? rootOf(object) : undefined;
}

function readsName(node: Extract<Argument, { type: "MemberExpression" }>) {
  return !node.computed && node.property.type === "Identifier" && node.property.name === "name";
}

function stringValue(node: Argument | null | undefined) {
  return node?.type === "Literal" && typeof node.value === "string" ? node.value : undefined;
}

export function definitionMethods(renamedJobs: ReadonlySet<string>): Rule.RuleModule {
  return {
    meta: {
      type: "problem",
      fixable: "code",
      docs: { description: "Rewrites dispatchAfterCommit(), broadcast(), broadcastAfterCommit(), sendMail(), emit() and notify() to the method of the definition." },
      messages: {
        method: "{{name}}() is removed: call {{method}}() on the definition",
        manual:
          "{{name}}() is removed: call {{method}}() on the definition in {{namespace}}, such as {{example}}, with the other arguments in the same order",
        renamed:
          '{{name}}() is removed, and "{{job}}" is a renamed() alias with no $jobs key: call dispatch() on the job it renames',
      },
      schema: [],
    },
    create(context) {
      const { sourceCode } = context;
      const { text } = sourceCode;

      if (!Object.keys(REMOVED).some((name) => text.includes(`${name}(`))) return {};

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

      function definitionText(call: CallNode, removed: Removed, node: Argument) {
        const named = definitionName(call, node);
        if (named !== undefined) return namespacePath(removed.namespace, named);
        if (node.type === "MemberExpression") return rootOf(node) === removed.namespace && !readsName(node) ? sourceCode.getText(node) : undefined;
        if (node.type !== "Identifier") return undefined;

        const [definition] = variableOf(call, node.name)?.defs ?? [];
        if (definition?.type === "ImportBinding") return node.name.endsWith(removed.suffix) ? node.name : undefined;
        if (definition?.type !== "Variable") return undefined;

        const { init } = definition.node;

        return init?.type === "CallExpression" && init.callee.type === "Identifier" && init.callee.name.startsWith("define") ? node.name : undefined;
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

          const replacement =
            args.length >= min && args.length <= max && args.every((arg) => arg.type !== "SpreadElement") && definition
              ? definitionText(call, removed, definition)
              : undefined;

          if (!replacement || !definition) {
            context.report({ node: call, messageId: "manual", data: { name, method: removed.method, namespace: removed.namespace, example: removed.example } });
            return;
          }

          context.report({
            node: call,
            messageId: "method",
            data: { name, method: removed.method },
            fix: (fixer) => {
              const end = sourceCode.getRange(call)[1];
              const others = args.filter((arg) => arg !== definition).map((arg) => sourceCode.getRange(arg));
              const [first, second] = others;
              if (!first) return fixer.replaceText(call, `${replacement}.${removed.method}()`);

              const rest = removed.definition === 0 || !second ? text.slice(first[0], end) : `${text.slice(first[0], first[1])}, ${text.slice(second[0], end)}`;

              return fixer.replaceText(call, `${replacement}.${removed.method}(${rest}`);
            },
          });
        },
      };
    },
  };
}
