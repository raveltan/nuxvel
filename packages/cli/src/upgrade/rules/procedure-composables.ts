import type { AST, Rule, Scope, SourceCode } from "eslint";

type EstreeNode = Parameters<SourceCode["getAncestors"]>[0];

type CallNode = Extract<EstreeNode, { type: "CallExpression" }>;

type ScriptIdentifier = Extract<Scope.Reference["identifier"], { type: "Identifier" }>;

export type ProcedureTemplateContainer = {
  references: { id: ScriptIdentifier; variable: object | null }[];
  expression: unknown;
  parent: { type: string; key?: { name?: { name?: string }; argument?: { name?: string } | null } };
};

type TemplateServices = {
  defineTemplateBodyVisitor?: (
    template: Record<string, (node: never) => void>,
    script: Rule.RuleListener,
    options: { templateBodyTriggerSelector: "Program" },
  ) => Rule.RuleListener;
};

const COMPOSABLES = {
  useQuery: { factory: "queryOptions", methods: new Set(["refetch", "refresh"]) },
  useMutation: { factory: "mutationOptions", methods: new Set(["mutate", "mutateAsync", "reset"]) },
};

function isComposable(name: string): name is keyof typeof COMPOSABLES {
  return name in COMPOSABLES;
}

function apiChain(node: EstreeNode): boolean {
  if (node.type === "Identifier") return node.name === "$api";

  return node.type === "MemberExpression" && !node.computed && !node.optional && apiChain(node.object);
}

function factoryCall(argument: EstreeNode, factory: string): CallNode | undefined {
  if (argument.type !== "CallExpression" || argument.optional || argument.callee.type !== "MemberExpression") return undefined;

  const { callee } = argument;

  if (callee.computed || callee.optional || callee.property.type !== "Identifier" || callee.property.name !== factory) return undefined;
  if (!apiChain(callee.object) || argument.arguments.some((input) => input.type === "SpreadElement")) return undefined;

  return argument;
}

export function lineIndent(sourceCode: SourceCode, node: EstreeNode) {
  const [start] = sourceCode.getRange(node);
  const lineStart = sourceCode.text.lastIndexOf("\n", start - 1) + 1;

  return /^[ \t]*/.exec(sourceCode.text.slice(lineStart))?.[0] ?? "";
}

export function reindent(sourceCode: SourceCode, node: EstreeNode, indent: string) {
  const from = lineIndent(sourceCode, node);

  return sourceCode
    .getText(node)
    .split("\n")
    .map((line, index) => (index > 0 && line.startsWith(from) ? indent + line.slice(from.length) : line))
    .join("\n");
}

export function withTemplateContainers(
  context: Rule.RuleContext,
  containers: ProcedureTemplateContainer[],
  script: Rule.RuleListener,
): Rule.RuleListener {
  const services: TemplateServices = context.sourceCode.parserServices;

  if (!services.defineTemplateBodyVisitor) return script;

  return services.defineTemplateBodyVisitor(
    {
      VExpressionContainer(node: ProcedureTemplateContainer) {
        containers.push(node);
      },
    },
    script,
    { templateBodyTriggerSelector: "Program" },
  );
}

function declared(sourceCode: SourceCode, node: EstreeNode, name: string) {
  for (let scope: Scope.Scope | null = sourceCode.getScope(node); scope; scope = scope.upper) {
    if (scope.set.get(name)?.defs.length) return true;
  }

  return false;
}

export function procedureComposables(
  context: Rule.RuleContext,
  containers: ProcedureTemplateContainer[],
): Rule.RuleListener["CallExpression"] {
  const { sourceCode } = context;

  function unwrapRange(identifier: ScriptIdentifier, methods: Set<string>): AST.Range | false | undefined {
    const [member, outer] = sourceCode.getAncestors(identifier).slice(-2).reverse();

    if (member?.type !== "MemberExpression" || member.object !== identifier || member.computed || member.property.type !== "Identifier") return false;
    if (methods.has(member.property.name)) return outer?.type === "CallExpression" && outer.callee === member ? undefined : false;
    if (outer?.type !== "MemberExpression" || outer.object !== member || outer.computed || outer.optional) return false;
    if (outer.property.type !== "Identifier" || outer.property.name !== "value") return false;

    const [, write] = sourceCode.getAncestors(member).slice(-2).reverse();

    if ((write?.type === "AssignmentExpression" && write.left === outer) || write?.type === "UpdateExpression") return false;

    return [sourceCode.getRange(member)[1], sourceCode.getRange(outer)[1]];
  }

  function templateUses(name: string) {
    return containers.flatMap((container) =>
      container.references
        .filter((reference) => reference.variable === null && reference.id.name === name)
        .map((reference) => ({ id: reference.id, query: queryProp(container, reference.id) })),
    );
  }

  function queryProp(container: ProcedureTemplateContainer, id: ScriptIdentifier) {
    const { key } = container.parent;

    return container.expression === id && container.parent.type === "VAttribute" && key?.name?.name === "bind" && key.argument?.name === "query";
  }

  return (call) => {
    if (call.callee.type !== "Identifier" || !isComposable(call.callee.name) || call.arguments.length !== 1) return;

    const composable = call.callee.name;
    const { factory, methods } = COMPOSABLES[composable];
    const [argument] = call.arguments;
    const getter =
      composable === "useQuery" && argument?.type === "ArrowFunctionExpression" && argument.params.length === 0 && argument.body.type !== "BlockStatement";
    const options = argument && factoryCall(getter && argument.type === "ArrowFunctionExpression" ? argument.body : argument, factory);
    const [container, declaration, declarator] = sourceCode.getAncestors(call).slice(-3);

    if (!options || options.callee.type !== "MemberExpression" || options.arguments.length > 1) return;
    if (declarator?.type !== "VariableDeclarator" || declarator.init !== call || declarator.id.type !== "Identifier") return;
    if (declaration?.type !== "VariableDeclaration" || declaration.kind !== "const" || declaration.declarations.length !== 1) return;
    if (container?.type === "ExportNamedDeclaration" || declared(sourceCode, call, composable)) return;

    const [variable] = sourceCode.getDeclaredVariables(declarator);

    if (!variable) return;

    const scriptUses = variable.references.flatMap(({ identifier }) =>
      identifier.type === "Identifier" && identifier !== declarator.id ? [{ id: identifier, query: false }] : [],
    );
    const uses = [...scriptUses, ...(variable.scope.type === "module" ? templateUses(variable.name) : [])];
    const ranges = uses.map(({ id, query }) => (query ? undefined : unwrapRange(id, methods)));

    if (ranges.includes(false)) return;

    const procedure = sourceCode.getText(options.callee.object);
    const [input] = options.arguments;
    const inputText = input && reindent(sourceCode, input, lineIndent(sourceCode, call));
    const queryInput = input?.type === "ObjectExpression" ? `(${inputText})` : inputText;
    const replacement = inputText === undefined ? "" : getter ? `() => ${queryInput}` : inputText;

    context.report({
      node: call,
      messageId: "composable",
      data: { composable },
      fix: (fixer) => [
        fixer.replaceText(call, `${procedure}.${composable}(${replacement})`),
        ...ranges.flatMap((range) => (range ? [fixer.removeRange(range)] : [])),
      ],
    });
  };
}
