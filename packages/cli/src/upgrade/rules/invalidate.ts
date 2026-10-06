import type { AST, Rule, Scope, SourceCode } from "eslint";

type EstreeNode = Parameters<SourceCode["getAncestors"]>[0];

type CallNode = Extract<EstreeNode, { type: "CallExpression" }>;

type FunctionNode = Extract<EstreeNode, { type: "ArrowFunctionExpression" | "FunctionExpression" }>;

type PropertyNode = Extract<EstreeNode, { type: "Property" }>;

type ObjectNode = Extract<EstreeNode, { type: "ObjectExpression" }>;

type Invalidation = { call: CallNode; removed: EstreeNode; callback: FunctionNode; property: PropertyNode; options: ObjectNode; optional: boolean };

const CALLBACKS = new Set(["onSuccess", "onSettled"]);
const WRAPPERS = new Set(["toasted", "optimistic"]);

function calls(node: EstreeNode | undefined, name: string): node is CallNode {
  return node?.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === name;
}

function member(node: EstreeNode, name: string) {
  return node.type === "MemberExpression" && !node.computed && !node.optional && node.property.type === "Identifier" && node.property.name === name;
}

function lineRange(sourceCode: SourceCode, [start, end]: AST.Range): AST.Range {
  const { text } = sourceCode;
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = text.indexOf("\n", end);

  if (text.slice(lineStart, start).trim() !== "" || (lineEnd !== -1 && text.slice(end, lineEnd).trim() !== "")) return [start, end];

  return [lineStart, lineEnd === -1 ? text.length : lineEnd + 1];
}

function statementRange(sourceCode: SourceCode, statement: EstreeNode): AST.Range {
  const { text } = sourceCode;
  const [start, end] = sourceCode.getRange(statement);
  const range = lineRange(sourceCode, [start, end]);
  const [lineStart, afterLine] = range;

  if (lineStart === start && afterLine === end) return range;

  const nextLineEnd = text.indexOf("\n", afterLine);
  const nextBlank = nextLineEnd !== -1 && text.slice(afterLine, nextLineEnd).trim() === "";
  const previousLine = lineStart < 2 ? "" : text.slice(text.lastIndexOf("\n", lineStart - 2) + 1, lineStart - 1).trim();
  const previousBlank = previousLine === "" || previousLine.endsWith("{");

  return nextBlank && previousBlank ? [lineStart, nextLineEnd + 1] : range;
}

export const invalidate: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: { description: "Removes the invalidation of a mutation's own namespace, which the client now does after every mutation." },
    messages: { removed: "The client invalidates the mutation's namespace after it succeeds" },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;

    if (!sourceCode.text.includes("invalidateQueries")) return {};

    const invalidations: Invalidation[] = [];

    function variableOf(identifier: EstreeNode) {
      for (let scope: Scope.Scope | null = sourceCode.getScope(identifier); scope; scope = scope.upper) {
        const reference = scope.references.find((candidate) => candidate.identifier === identifier);
        if (reference) return reference.resolved;
      }

      return null;
    }

    function declarator(variable: Scope.Variable | null, composable: string) {
      const [def, ...others] = variable?.defs ?? [];

      if (!def || others.length > 0 || def.node.type !== "VariableDeclarator" || def.parent?.type !== "VariableDeclaration") return undefined;
      if (def.parent.kind !== "const" || def.parent.declarations.length !== 1) return undefined;

      const init = def.node.init ?? undefined;

      return calls(init, composable) && init.arguments.length === 0 ? { declaration: def.parent, init } : undefined;
    }

    function apiRoot(node: EstreeNode) {
      if (calls(node, "useTRPC")) return node.arguments.length === 0;
      if (node.type !== "Identifier") return false;

      return node.name === "$api" || declarator(variableOf(node), "useTRPC") !== undefined;
    }

    function path(node: EstreeNode): string[] | undefined {
      if (apiRoot(node)) return [];
      if (node.type !== "MemberExpression" || node.computed || node.optional || node.property.type !== "Identifier") return undefined;

      const parent = path(node.object);

      return parent && [...parent, node.property.name];
    }

    function mutationPath(node: EstreeNode | undefined): string[] | undefined {
      if (node?.type !== "CallExpression" || node.optional) return undefined;
      if (node.callee.type === "Identifier" && WRAPPERS.has(node.callee.name)) return mutationPath(node.arguments[0]);
      if (!member(node.callee, "mutationOptions") || node.arguments.length > 0 || node.callee.type !== "MemberExpression") return undefined;

      return path(node.callee.object);
    }

    function optionsOf(options: ObjectNode) {
      const call = sourceCode.getAncestors(options).at(-1);

      if (call?.type !== "CallExpression" || call.optional) return undefined;
      if (calls(call, "useActionForm") && call.arguments[2] === options) return { mutation: mutationPath(call.arguments[1]), optional: false };
      if (call.arguments.length !== 1 || call.arguments[0] !== options) return undefined;
      if (member(call.callee, "useMutation") && call.callee.type === "MemberExpression") return { mutation: path(call.callee.object), optional: true };
      if (!calls(call, "useMutation")) return undefined;

      const spreads = options.properties.flatMap((property) => (property.type === "SpreadElement" ? [mutationPath(property.argument)] : []));

      return { mutation: spreads.length === 1 ? spreads[0] : undefined, optional: false };
    }

    function keyPath(argument: EstreeNode | undefined) {
      if (argument?.type !== "ObjectExpression" || argument.properties.length !== 1) return undefined;

      const [property] = argument.properties;

      if (property?.type !== "Property" || property.computed || property.shorthand || property.key.type !== "Identifier") return undefined;
      if (property.key.name !== "key" || property.value.type !== "CallExpression" || property.value.optional) return undefined;

      const { callee } = property.value;

      return member(callee, "key") && callee.type === "MemberExpression" ? path(callee.object) : undefined;
    }

    function queryCache(node: EstreeNode) {
      if (calls(node, "useQueryCache")) return node.arguments.length === 0;

      return node.type === "Identifier" && declarator(variableOf(node), "useQueryCache") !== undefined;
    }

    function removable(call: CallNode) {
      const [first, ...rest] = sourceCode.getAncestors(call).reverse();
      const awaited = first?.type === "AwaitExpression" && first.argument === call;
      const expression = awaited ? first : call;
      const ancestors = awaited ? rest : sourceCode.getAncestors(call).reverse();
      const [parent, block] = ancestors;

      if (parent?.type === "ArrowFunctionExpression" && parent.body === expression) {
        const [property, options] = ancestors.slice(1);
        return { removed: expression, callback: parent, property, options };
      }

      const statement =
        (parent?.type === "ExpressionStatement" && parent.expression === expression) || (parent?.type === "ReturnStatement" && parent.argument === expression);

      if (!statement || block?.type !== "BlockStatement") return undefined;

      const [callback, property, options] = ancestors.slice(2);

      if ((callback?.type !== "ArrowFunctionExpression" && callback?.type !== "FunctionExpression") || callback.body !== block) return undefined;

      return { removed: parent, callback, property, options };
    }

    function check(call: CallNode) {
      if (call.callee.type !== "MemberExpression" || !member(call.callee, "invalidateQueries") || call.arguments.length !== 1) return;
      if (!queryCache(call.callee.object)) return;

      const key = keyPath(call.arguments[0]);
      const found = removable(call);

      if (!key?.length || !found) return;

      const { removed, callback, property, options } = found;

      if (property?.type !== "Property" || property.value !== callback || property.computed || property.key.type !== "Identifier") return;
      if (!CALLBACKS.has(property.key.name) || options?.type !== "ObjectExpression") return;

      const invalidateOption = options.properties.some(
        (other) => other.type === "Property" && !other.computed && other.key.type === "Identifier" && other.key.name === "invalidate",
      );
      const role = optionsOf(options);

      if (invalidateOption || !role?.mutation?.length || role.mutation[0] !== key[0]) return;

      invalidations.push({ call, removed, callback, property, options, optional: role.optional });
    }

    function listItemRange(node: EstreeNode): AST.Range {
      const [start, end] = sourceCode.getRange(node);
      const after = sourceCode.getTokenAfter(node);
      const comma = after?.value === "," ? after : undefined;
      const lines = lineRange(sourceCode, [start, comma ? comma.range[1] : end]);

      if (lines[0] !== start) return lines;
      if (comma) return [start, sourceCode.getTokenAfter(comma)?.range[0] ?? comma.range[1]];

      const before = sourceCode.getTokenBefore(node);

      return [before?.value === "," ? before.range[0] : start, end];
    }

    function fixes(fixer: Rule.RuleFixer) {
      const removals: AST.Range[] = [];
      const replaced: Rule.Fix[] = [];
      const covered: AST.Range[] = [];
      const objects = new Map<ObjectNode, { optional: boolean; properties: Set<PropertyNode> }>();

      for (const callback of new Set(invalidations.map((entry) => entry.callback))) {
        const own = invalidations.filter((entry) => entry.callback === callback);
        const removed = new Set<EstreeNode>(own.map((entry) => entry.removed));
        const [first] = own;

        if (!first) continue;

        if (callback.body.type === "BlockStatement" && !callback.body.body.every((statement) => removed.has(statement))) {
          removals.push(...[...removed].map((statement) => statementRange(sourceCode, statement)));
          continue;
        }

        const entry = objects.get(first.options) ?? { optional: first.optional, properties: new Set<PropertyNode>() };
        entry.properties.add(first.property);
        objects.set(first.options, entry);
      }

      for (const [options, { optional, properties }] of objects) {
        if (!options.properties.every((property) => property.type === "Property" && properties.has(property))) {
          removals.push(...[...properties].map(listItemRange));
          continue;
        }

        replaced.push(fixer.replaceText(options, optional ? "" : "{}"));
        covered.push(sourceCode.getRange(options));
      }

      const inside = (node: EstreeNode) => {
        const [start, end] = sourceCode.getRange(node);
        return [...removals, ...covered].some(([from, to]) => from <= start && end <= to);
      };

      const unused = (variable: Scope.Variable) => {
        const pattern = new RegExp(`(?<![\\w$])${variable.name.replaceAll("$", "\\$")}(?![\\w$])`, "g");
        const occurrences = sourceCode.text.match(pattern)?.length ?? 0;
        const declared = new Set<unknown>(variable.identifiers);
        const names = new Set<unknown>([...declared, ...variable.references.map((reference) => reference.identifier)]);
        const kept = variable.references.filter(({ identifier }) => identifier.type !== "Identifier" || (!declared.has(identifier) && !inside(identifier)));

        return kept.length === 0 && occurrences === names.size;
      };

      const composables: EstreeNode[] = invalidations.flatMap(({ call }) =>
        call.callee.type === "MemberExpression" && calls(call.callee.object, "useQueryCache") ? [call.callee.object.callee] : [],
      );

      for (const variable of new Set(invalidations.flatMap(({ call }) => (call.callee.type === "MemberExpression" ? [variableOf(call.callee.object)] : [])))) {
        const declared = declarator(variable, "useQueryCache");

        if (!variable || !declared || !unused(variable)) continue;

        removals.push(statementRange(sourceCode, declared.declaration));
        composables.push(declared.init.callee);
      }

      for (const variable of new Set(composables.map(variableOf))) {
        const [def] = variable?.defs ?? [];

        if (!variable || def?.type !== "ImportBinding" || def.parent?.type !== "ImportDeclaration") continue;
        if (!variable.references.every(({ identifier }) => identifier.type === "Identifier" && inside(identifier))) continue;

        removals.push(def.parent.specifiers.length === 1 ? statementRange(sourceCode, def.parent) : listItemRange(def.node));
      }

      return [...replaced, ...removals.map((range) => fixer.removeRange(range))];
    }

    return {
      CallExpression: check,
      "Program:exit"() {
        const [first] = invalidations;

        if (first) context.report({ node: first.removed, messageId: "removed", fix: fixes });
      },
    };
  },
};
