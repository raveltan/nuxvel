import type { Rule } from "eslint";
import { namespacePath } from "./definition-methods.ts";

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

export const notificationInput: Rule.RuleModule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: { description: "Renames schema to input in defineNotification(), and data to input and a mail name to its $mails definition in what toMail returns." },
    messages: {
      renamed: "defineNotification() takes input in place of schema, and toMail returns { mail, input }",
      manualSchema: "defineNotification() takes input in place of schema: rename the schema key of this notification to input",
      manualSpread:
        "defineNotification() takes input in place of schema, and toMail returns { mail, input }: check what this spread adds to the notification by hand",
      manualMail:
        "toMail returns the mail as its $mails definition: make this mail a $mails path, such as $mails.post.published, when it is a name",
      manualToMail:
        "toMail returns { mail, input }: return the mail's $mails definition as mail, such as $mails.post.published, and its input as input in place of data",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;

    if (!sourceCode.text.includes("defineNotification(")) return {};

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

      return mail?.value.type === "Literal" && typeof mail.value.value === "string" ? { mail, name: namespacePath("$mails", mail.value.value) ?? "" } : undefined;
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

      if (!objects || objects.some((object) => mailName(object)?.name === "")) {
        context.report({ node: toMail, messageId: "manualToMail" });
        return;
      }

      for (const object of objects) {
        const data = propertyNamed(object, "data");
        const named = mailName(object);

        const mail = propertyNamed(object, "mail");

        if (data) renameKey(data, "input");
        if (mail && (mail.value.type === "Identifier" || mail.value.type === "TemplateLiteral")) context.report({ node: mail, messageId: "manualMail" });
        if (named) context.report({ node: named.mail, messageId: "renamed", fix: (fixer) => fixer.replaceText(named.mail.value, named.name) });
      }
    }

    return {
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
