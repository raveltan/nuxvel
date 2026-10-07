import { camelCase } from "@nuxvel/nuxt/cli";
import type { Rule } from "eslint";
import { addDefinitionImports } from "./definition-imports.ts";
import type { DefinitionImport } from "./explicit-imports.ts";

type Value = Extract<Rule.Node, { type: "Property" }>["value"];

type ObjectNode = Extract<Value, { type: "ObjectExpression" }>;

type PropertyNode = Extract<ObjectNode["properties"][number], { type: "Property" }>;

function keyName(property: PropertyNode) {
  if (property.computed) return undefined;
  const { key } = property;
  if (key.type === "Identifier") return key.name;

  return key.type === "Literal" && typeof key.value === "string" ? key.value : undefined;
}

function propertyNamed(object: ObjectNode, name: string) {
  return object.properties.find((property): property is PropertyNode => property.type === "Property" && keyName(property) === name);
}

function isObject(node: Value | null | undefined): node is ObjectNode {
  return node?.type === "ObjectExpression";
}

const FUNCTION_TYPES = new Set(["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration"]);

const MAIL_IMPORT = /(^|\/)mail\//;

export function notificationInput(leaves: ReadonlyMap<string, DefinitionImport>): Rule.RuleModule {
  return {
    meta: {
      type: "problem",
      fixable: "code",
      docs: { description: "Renames schema to input in defineNotification(), and data to input and a mail name to its imported definition in what toMail returns." },
      messages: {
        renamed: "defineNotification() takes input in place of schema, and toMail returns { mail, input }",
        manualSchema: "defineNotification() takes input in place of schema: rename the schema key of this notification to input",
        manualSpread:
          "defineNotification() takes input in place of schema, and toMail returns { mail, input }: check what this spread adds to the notification by hand",
        manualMail: "toMail returns the mail as its definition: import the mail from its file in server/mail/ and return it in place of this name",
        manualToMail: "toMail returns { mail, input }: import the mail from its file in server/mail/ as mail, and rename data to input",
        imports: "no longer auto-imported: import {{names}} from its file",
      },
      schema: [],
    },
    create(context) {
      const { sourceCode } = context;

      if (!sourceCode.text.includes("defineNotification(")) return {};

      const mailImports = new Set(
        sourceCode.ast.body.flatMap((statement) =>
          statement.type === "ImportDeclaration" && typeof statement.source.value === "string" && MAIL_IMPORT.test(statement.source.value)
            ? statement.specifiers.map(({ local }) => local.name)
            : [],
        ),
      );
      const imports: DefinitionImport[] = [];

      function renameKey(property: PropertyNode, name: string) {
        context.report({
          node: property,
          messageId: "renamed",
          fix: (fixer) =>
            property.shorthand ? fixer.replaceText(property, `${name}: ${sourceCode.getText(property.value)}`) : fixer.replaceText(property.key, name),
        });
      }

      function mailName(object: ObjectNode) {
        const mail = propertyNamed(object, "mail");
        if (mail?.value.type !== "Literal" || typeof mail.value.value !== "string") return undefined;
        const definition = leaves.get(mail.value.value.split(".").map(camelCase).join("."));

        return { mail, definition };
      }

      const returnsOf = new Map<unknown, Value[]>();

      function returnedObjects(fn: Value): ObjectNode[] | undefined {
        if (fn.type !== "ArrowFunctionExpression" && fn.type !== "FunctionExpression") return undefined;
        const returned = fn.body.type === "BlockStatement" ? (returnsOf.get(fn) ?? []) : [fn.body];
        const objects = returned.filter(isObject);

        return returned.length > 0 && objects.length === returned.length ? objects : undefined;
      }

      function rewriteToMail(toMail: PropertyNode) {
        const objects = returnedObjects(toMail.value);

        if (
          !objects ||
          objects.some((object) => {
            const mail = mailName(object);

            return mail !== undefined && mail.definition === undefined;
          })
        ) {
          context.report({ node: toMail, messageId: "manualToMail" });
          return;
        }

        for (const object of objects) {
          const data = propertyNamed(object, "data");
          const mail = propertyNamed(object, "mail");
          const definition = mailName(object)?.definition;

          if (data) renameKey(data, "input");
          if (mail && (mail.value.type === "TemplateLiteral" || (mail.value.type === "Identifier" && !mailImports.has(mail.value.name)))) {
            context.report({ node: mail, messageId: "manualMail" });
          }
          if (mail && definition) {
            imports.push(definition);
            context.report({ node: mail, messageId: "renamed", fix: (fixer) => fixer.replaceText(mail.value, definition.name) });
          }
        }
      }

      return {
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
        ReturnStatement(statement) {
          const fn = sourceCode.getAncestors(statement).reverse().find((ancestor) => FUNCTION_TYPES.has(ancestor.type));
          if (!fn || !statement.argument) return;

          returnsOf.set(fn, [...(returnsOf.get(fn) ?? []), statement.argument]);
        },
        "CallExpression:exit"(call: Extract<Rule.Node, { type: "CallExpression" }>) {
          if (call.callee.type !== "Identifier" || call.callee.name !== "defineNotification") return;
          const [config] = call.arguments;
          if (!config) return;
          if (config.type !== "ObjectExpression") {
            context.report({ node: config, messageId: "manualSchema" });
            return;
          }

          const schema = propertyNamed(config, "schema");
          if (config.properties.some((property) => property.type === "SpreadElement")) {
            context.report({ node: config, messageId: "manualSpread" });
          }
          if (schema) renameKey(schema, "input");

          const toMail = propertyNamed(config, "toMail");
          if (toMail) rewriteToMail(toMail);
        },
      };
    },
  };
}
