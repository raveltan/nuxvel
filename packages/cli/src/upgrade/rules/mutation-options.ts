import type { Rule, Scope, SourceCode } from "eslint";
import { lineIndent, type ProcedureTemplateContainer, procedureComposables, reindent, withTemplateContainers } from "./procedure-composables.ts";

type EstreeNode = Parameters<SourceCode["getAncestors"]>[0];

type CallNode = Extract<EstreeNode, { type: "CallExpression" }>;

type Option = { name: string | undefined; node: EstreeNode; key: string };

const WRAPPERS: Record<string, string> = { toasted: "toast", optimistic: "optimistic" };

function wrapperOption(node: EstreeNode | undefined) {
  return node?.type === "CallExpression" && !node.optional && node.callee.type === "Identifier" ? WRAPPERS[node.callee.name] : undefined;
}

function propertyName(property: EstreeNode) {
  return property.type === "Property" && !property.computed && property.key.type === "Identifier" ? property.key.name : undefined;
}

export const mutationOptions: Rule.RuleModule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: { description: "Replaces toasted() and optimistic() with the toast and optimistic options of $api mutations." },
    messages: {
      replaced: "{{name}}() is replaced by the {{option}} option of .mutationOptions() and .useMutation()",
      manual: "{{name}}() is removed: pass its second argument as the {{option}} option of $api.<path>.mutationOptions() or .useMutation()",
      composable: "{{composable}}() of the procedure's options is replaced by its .{{composable}}()",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;

    if (!["toasted(", "optimistic(", "mutationOptions("].some((name) => sourceCode.text.includes(name))) return {};

    const containers: ProcedureTemplateContainer[] = [];
    const composables = procedureComposables(context, containers);

    function declaration(call: CallNode) {
      if (call.callee.type !== "Identifier") return undefined;

      for (let scope: Scope.Scope | null = sourceCode.getScope(call); scope; scope = scope.upper) {
        const [def] = scope.set.get(call.callee.name)?.defs ?? [];
        if (def) return def;
      }

      return undefined;
    }

    function collect(node: EstreeNode | undefined): { callee: string; options: Option[] } | undefined {
      if (node?.type === "ObjectExpression") {
        const [first, ...rest] = node.properties;

        if (first?.type !== "SpreadElement" || rest.some((property) => property.type === "SpreadElement")) return undefined;

        const inner = collect(first.argument);

        return inner && { ...inner, options: [...inner.options, ...rest.map((property) => ({ name: propertyName(property), node: property, key: "" }))] };
      }

      if (node?.type !== "CallExpression" || node.optional) return undefined;

      const { callee } = node;

      if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier" && callee.property.name === "mutationOptions") {
        const [argument, ...rest] = node.arguments;

        if (rest.length > 0 || (argument && argument.type !== "ObjectExpression")) return undefined;

        const options = argument?.type === "ObjectExpression" ? argument.properties.map((property) => ({ name: propertyName(property), node: property, key: "" })) : [];

        return { callee: sourceCode.getText(callee), options };
      }

      const option = wrapperOption(node);
      const [wrapped, update, ...rest] = node.arguments;

      if (!option || !update || rest.length > 0 || update.type === "SpreadElement" || declaration(node)) return undefined;

      const inner = collect(wrapped);

      if (!inner || inner.options.some(({ name }) => name === option)) return undefined;

      return { ...inner, options: [...inner.options, { name: option, node: update, key: `${option}: ` }] };
    }

    function rewrite(call: CallNode, { callee, options }: { callee: string; options: Option[] }) {
      const indent = lineIndent(sourceCode, call);
      const texts = options.map(({ node, key }) => key + reindent(sourceCode, node, `${indent}  `));

      if (!texts.some((text) => text.includes("\n"))) return `${callee}({ ${texts.join(", ")} })`;

      return `${callee}({\n${texts.map((text) => `${indent}  ${text},\n`).join("")}${indent}})`;
    }

    function outermost(call: CallNode) {
      const parent = sourceCode.getAncestors(call).at(-1);
      const holder = parent?.type === "SpreadElement" ? sourceCode.getAncestors(parent).at(-1) : parent;
      const outer = holder?.type === "ObjectExpression" ? sourceCode.getAncestors(holder).at(-1) : holder;
      const argument = holder?.type === "ObjectExpression" ? holder : call;

      return !(outer?.type === "CallExpression" && wrapperOption(outer) && outer.arguments[0] === argument);
    }

    function check(call: CallNode) {
      const option = wrapperOption(call);

      if (!option || call.callee.type !== "Identifier" || !outermost(call)) return;

      const name = call.callee.name;
      const declared = declaration(call);

      if (declared && declared.type !== "ImportBinding") return;

      const collected = declared ? undefined : collect(call);

      if (!collected) {
        context.report({ node: call, messageId: "manual", data: { name, option } });
        return;
      }

      context.report({ node: call, messageId: "replaced", data: { name, option }, fix: (fixer) => fixer.replaceText(call, rewrite(call, collected)) });
    }

    return withTemplateContainers(context, containers, {
      CallExpression(call) {
        check(call);
        composables?.(call);
      },
    });
  },
};
