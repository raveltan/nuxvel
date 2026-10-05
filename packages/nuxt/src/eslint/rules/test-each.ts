import type { Rule } from "eslint";
import type { CallNode } from "./ast";

const TEST_FUNCTIONS = new Set(["it", "test", "describe"]);
const LOOPS = new Set(["ForStatement", "ForOfStatement", "ForInStatement", "WhileStatement", "DoWhileStatement"]);
const ITERATORS = new Set(["forEach", "map", "flatMap"]);

function memberPath(node: CallNode["callee"]): string[] | undefined {
  if (node.type === "Identifier") return [node.name];
  if (node.type !== "MemberExpression" || node.computed || node.property.type !== "Identifier") return undefined;

  const object = memberPath(node.object);

  return object && [...object, node.property.name];
}

function isIteratorCallback(node: Rule.Node) {
  if (node.type !== "ArrowFunctionExpression" && node.type !== "FunctionExpression") return false;

  const { parent } = node;

  if (parent.type !== "CallExpression" || !parent.arguments.includes(node)) return false;

  const { callee } = parent;

  return callee.type === "MemberExpression" && callee.property.type === "Identifier" && ITERATORS.has(callee.property.name);
}

function inLoop(node: Rule.Node) {
  for (let current: Rule.Node | null = node.parent; current; current = current.parent) {
    if (LOOPS.has(current.type) || isIteratorCallback(current)) return true;
  }

  return false;
}

/**
 * The `nuxvel/test-each` rule: tests that differ only by their data use
 * `it.for`. It reports `it.each`, `test.each` and `describe.each`, and a
 * call of `it`, `test` or `describe` inside a `for` or `while` loop or a
 * `forEach`, `map` or `flatMap` callback. It is part of the `nuxvel`
 * ESLint plugin.
 */
export const testEach: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: { description: "Tests that differ only by their data use it.for." },
    messages: {
      each: "Use {{name}}.for in place of {{name}}.each: it passes the case as one argument and keeps the test context",
      loop: "{{name}}() in a loop: write it once with {{name}}.for(cases), one case per line",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const path = memberPath(node.callee);
        const name = path?.[0];

        if (!path || !name || !TEST_FUNCTIONS.has(name)) return;

        if (path.at(-1) === "each") {
          context.report({ node, messageId: "each", data: { name } });
          return;
        }

        if (!path.includes("for") && inLoop(node)) context.report({ node, messageId: "loop", data: { name } });
      },
    };
  },
};
