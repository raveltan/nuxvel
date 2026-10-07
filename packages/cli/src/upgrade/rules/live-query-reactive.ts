import type { Rule, Scope, SourceCode } from "eslint";
import { type ProcedureTemplateContainer, withTemplateContainers } from "./procedure-composables.ts";

type EstreeNode = Parameters<SourceCode["getAncestors"]>[0];

const REACTIVE_READERS = new Set(["toRefs", "toRef", "toRaw", "isReactive"]);

const REF_READERS = new Set(["watch", "unref", "toValue"]);

function isUseLiveQuery(node: EstreeNode | undefined) {
  return node?.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "useLiveQuery";
}

function memberName(node: EstreeNode | undefined, object: EstreeNode): string | undefined {
  if (node?.type === "MemberExpression" && node.object === object && !node.computed && node.property.type === "Identifier") return node.property.name;
  return undefined;
}

export const liveQueryReactive: Rule.RuleModule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: { description: "Removes .value after the fields of a useLiveQuery() result." },
    messages: {
      unwrapped: "useLiveQuery() returns a reactive object, so its fields need no .value",
      destructured: "useLiveQuery() returns a reactive object: toRefs() keeps the destructured fields refs",
      write: "useLiveQuery() returns a reactive object: write {{name}} without .value by hand",
      unwrappedUse: "useLiveQuery() returns a reactive object, so the fields of {{name}} are no longer refs here: destructure toRefs({{name}}), or read {{name}}.<field> without .value",
      ref: "useLiveQuery() returns a reactive object, so {{name}} is no longer a ref: pass () => {{name}}",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;

    if (!sourceCode.text.includes("useLiveQuery")) return {};

    const containers: ProcedureTemplateContainer[] = [];
    const bindings: { variable?: Scope.Variable; objects: EstreeNode[] }[] = [];

    function field(object: EstreeNode) {
      const [outer, member] = sourceCode.getAncestors(object).slice(-2);
      const name = memberName(member, object);

      if (name === undefined || !member) return undefined;

      return { member, outer, value: memberName(outer, member) === "value" ? outer : undefined };
    }

    function bareUse(object: EstreeNode) {
      if (object.type !== "Identifier") return;

      const parent = sourceCode.getAncestors(object).at(-1);
      const destructured = parent?.type === "VariableDeclarator" && parent.init === object && parent.id.type === "ObjectPattern";
      const passed =
        parent?.type === "CallExpression" && parent.arguments.includes(object) && !(parent.callee.type === "Identifier" && REACTIVE_READERS.has(parent.callee.name));

      if (destructured || passed) context.report({ node: object, messageId: "unwrappedUse", data: { name: object.name } });
    }

    function unwrap(objects: EstreeNode[]) {
      for (const object of objects) bareUse(object);

      const fields = objects.flatMap((object) => field(object) ?? []);

      for (const { member, outer, value } of fields) {
        const text = sourceCode.getText(member);

        if (!value) {
          const readsRef = outer?.type === "CallExpression" && outer.arguments[0] === member && outer.callee.type === "Identifier" && REF_READERS.has(outer.callee.name);
          if (readsRef) context.report({ node: member, messageId: "ref", data: { name: text } });
          continue;
        }

        const write = sourceCode.getAncestors(value).at(-1);

        if ((write?.type === "AssignmentExpression" && write.left === value) || write?.type === "UpdateExpression") {
          context.report({ node: member, messageId: "write", data: { name: text } });
          continue;
        }

        context.report({
          node: value,
          messageId: "unwrapped",
          fix: (fixer) => fixer.removeRange([sourceCode.getRange(member)[1], sourceCode.getRange(value)[1]]),
        });
      }
    }

    const script: Rule.RuleListener = {
      CallExpression(call) {
        if (!isUseLiveQuery(call)) return;

        const declarator = sourceCode.getAncestors(call).at(-1);

        if (declarator?.type !== "VariableDeclarator" || declarator.init !== call) return void bindings.push({ objects: [call] });

        if (declarator.id.type === "ObjectPattern") {
          context.report({ node: call, messageId: "destructured", fix: (fixer) => fixer.replaceText(call, `toRefs(${sourceCode.getText(call)})`) });
          return;
        }

        const [variable] = sourceCode.getDeclaredVariables(declarator);

        if (!variable) return;

        bindings.push({ variable, objects: variable.references.flatMap(({ identifier }) => (identifier.type === "Identifier" && identifier !== declarator.id ? [identifier] : [])) });
      },
      "Program:exit"() {
        for (const { variable, objects } of bindings) {
          if (variable?.scope.type === "module") {
            for (const { references } of containers) {
              for (const { id, variable: resolved } of references) if (resolved === null && id.name === variable.name) objects.push(id);
            }
          }

          unwrap(objects);
        }
      },
    };

    return withTemplateContainers(context, containers, script);
  },
};
