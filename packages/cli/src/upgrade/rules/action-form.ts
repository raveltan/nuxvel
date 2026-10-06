import type { Rule, Scope, SourceCode } from "eslint";
import { lineIndent, reindent } from "./procedure-composables.ts";

type EstreeNode = Parameters<SourceCode["getAncestors"]>[0];

type CallNode = Extract<EstreeNode, { type: "CallExpression" }>;

type ObjectNode = Extract<EstreeNode, { type: "ObjectExpression" }>;

function memberPath(node: EstreeNode): string[] | undefined {
  if (node.type === "Identifier") return [node.name];
  if (node.type !== "MemberExpression" || node.computed || node.optional || node.property.type !== "Identifier") return undefined;
  const object = memberPath(node.object);

  return object && [...object, node.property.name];
}

function propertyName(property: ObjectNode["properties"][number]) {
  return property.type === "Property" && !property.computed && property.key.type === "Identifier" ? property.key.name : undefined;
}

function mutationOptionsCall(node: EstreeNode | undefined) {
  if (node?.type !== "CallExpression" || node.optional || node.callee.type !== "MemberExpression") return undefined;
  const { callee } = node;
  if (callee.computed || callee.optional || callee.property.type !== "Identifier" || callee.property.name !== "mutationOptions") return undefined;
  const path = memberPath(callee.object);
  const [options, ...rest] = node.arguments;
  if (!path || path.length < 2 || rest.length > 0 || (options && options.type !== "ObjectExpression")) return undefined;

  return { path: path.slice(1).join("."), options };
}

function isProcedureOptions(node: EstreeNode | undefined) {
  return node?.type === "ObjectExpression" && !node.properties.some((property) => propertyName(property) === "mutation");
}

export function actionForm(sharedInputs: Map<string, string>): Rule.RuleModule {
  return {
    meta: {
      type: "problem",
      fixable: "code",
      docs: { description: "Rewrites useActionForm(schema, mutationOptions, options) to useActionForm($api.<path>, options)." },
      messages: {
        replaced: "useActionForm() takes the $api procedure and one options object",
        manual:
          "useActionForm(schema, mutationOptions, options) is removed: write useActionForm($api.<path>, { ...options }) with the options of mutationOptions() among them, and schema only when it is not the procedure's input schema from shared/schemas/",
      },
      schema: [],
    },
    create(context) {
      const { sourceCode } = context;

      if (!sourceCode.text.includes("useActionForm(")) return {};

      function declared(call: CallNode) {
        for (let scope: Scope.Scope | null = sourceCode.getScope(call); scope; scope = scope.upper) {
          if (scope.set.get("useActionForm")?.defs.length) return true;
        }

        return false;
      }

      function rewrite(call: CallNode) {
        const [schema, mutation, formOptions, ...rest] = call.arguments;
        const options = mutationOptionsCall(mutation);
        if (!schema || !options || rest.length > 0 || schema.type === "SpreadElement") return undefined;
        if (formOptions && formOptions.type !== "ObjectExpression") return undefined;

        const properties = [...(options.options?.properties ?? []), ...(formOptions?.properties ?? [])];
        const names = properties.map(propertyName);
        const passedOnSuccess = options.options?.properties.some((property) => propertyName(property) === "onSuccess");
        const duplicate = names.some((name, index) => name !== undefined && names.indexOf(name) !== index);
        if (passedOnSuccess || duplicate || names.includes("schema")) return undefined;

        const indent = lineIndent(sourceCode, call);
        const keepSchema = !(schema.type === "Identifier" && sharedInputs.get(options.path) === schema.name);
        const texts = [
          ...properties.map((property) => reindent(sourceCode, property, `${indent}  `)),
          ...(keepSchema ? [`schema: ${reindent(sourceCode, schema, `${indent}  `)}`] : []),
        ];
        const procedure = `$api.${options.path}`;

        if (texts.length === 0) return `useActionForm(${procedure})`;
        if (!texts.some((text) => text.includes("\n"))) return `useActionForm(${procedure}, { ${texts.join(", ")} })`;

        return `useActionForm(${procedure}, {\n${texts.map((text) => `${indent}  ${text},\n`).join("")}${indent}})`;
      }

      return {
        CallExpression(call) {
          if (call.callee.type !== "Identifier" || call.callee.name !== "useActionForm" || call.arguments.length < 2 || declared(call)) return;
          if (call.arguments.length === 2 && isProcedureOptions(call.arguments[1])) return;

          const replacement = rewrite(call);

          if (replacement === undefined) {
            context.report({ node: call, messageId: "manual" });
            return;
          }

          context.report({ node: call, messageId: "replaced", fix: (fixer) => fixer.replaceText(call, replacement) });
        },
      };
    },
  };
}
