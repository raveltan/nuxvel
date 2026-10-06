import type { AST, Rule, Scope, SourceCode } from "eslint";

type IdentifierNode = Extract<Rule.Node, { type: "Identifier" }>;

type EstreeNode = Parameters<SourceCode["getAncestors"]>[0];

type ScriptIdentifier = Extract<Scope.Reference["identifier"], { type: "Identifier" }>;

type ImportSpecifierNode = Extract<Rule.Node, { type: "ImportSpecifier" }>;

type TemplateReference = { id: IdentifierNode; variable: object | null };

type TemplateContainer = { references: TemplateReference[] };

type TemplateServices = {
  defineTemplateBodyVisitor?: (
    template: Record<string, (node: never) => void>,
    script: Rule.RuleListener,
    options: { templateBodyTriggerSelector: "Program" },
  ) => Rule.RuleListener;
};

const API = "$api";
const RETURN_TYPE_BEFORE = /ReturnType<\s*typeof\s+$/;
const RETURN_TYPE_AFTER = /^\s*>/;

function lineRange(sourceCode: SourceCode, statement: EstreeNode, container: EstreeNode | undefined): AST.Range {
  const { text } = sourceCode;
  const [start, end] = sourceCode.getRange(statement);
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = text.indexOf("\n", end);

  if (text.slice(lineStart, start).trim() !== "" || (lineEnd !== -1 && text.slice(end, lineEnd).trim() !== "")) return [start, end];

  const afterLine = lineEnd === -1 ? text.length : lineEnd + 1;
  const nextLineEnd = text.indexOf("\n", afterLine);
  const nextBlank = nextLineEnd !== -1 && text.slice(afterLine, nextLineEnd).trim() === "";
  const previousBlank = lineStart >= 2 && text.slice(text.lastIndexOf("\n", lineStart - 2) + 1, lineStart - 1).trim() === "";
  const first = container !== undefined && "body" in container && Array.isArray(container.body) && container.body[0] === statement;

  return [lineStart, nextBlank && (previousBlank || first) ? nextLineEnd + 1 : afterLine];
}

function importSource(specifier: ImportSpecifierNode) {
  const declaration = specifier.parent;

  return declaration.type === "ImportDeclaration" ? String(declaration.source.value) : "";
}

function apiTaken(scopeManager: Scope.ScopeManager | null) {
  return (scopeManager?.scopes ?? []).some((scope) =>
    scope.set.get(API)?.defs.some((def) => !(def.type === "ImportBinding" && def.parent.type === "ImportDeclaration" && def.parent.source.value === "#imports")),
  );
}

export const useTrpc: Rule.RuleModule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: { description: "Replaces useTRPC() with the auto-imported $api." },
    messages: {
      replaced: "useTRPC() is replaced by $api",
      apiTaken: "$api is declared in this file: rename it, then run nuxvel upgrade again to replace useTRPC() with $api",
      renamed: "useTRPC is imported as {{name}}: use $api in place of {{name}}()",
      value: "useTRPC is replaced by $api: use $api in place of what useTRPC() returned",
      imported: "useTRPC is imported from {{source}}: import $api from #imports in its place",
      named: '"useTRPC" names useTRPC(), which $api replaces: mock "$api" instead',
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;

    if (!sourceCode.text.includes("useTRPC")) return {};

    const containers: TemplateContainer[] = [];
    const identifiers: IdentifierNode[] = [];
    const literals: Rule.Node[] = [];

    function templateReferences(variable: Scope.Variable) {
      if (variable.scope.type !== "module") return [];

      return containers.flatMap(({ references }) =>
        references.filter((reference) => reference.variable === null && reference.id.name === variable.name).map((reference) => reference.id),
      );
    }

    function renameTo(fixer: Rule.RuleFixer, identifier: ScriptIdentifier, name: string) {
      const parent = sourceCode.getAncestors(identifier).at(-1);
      const shorthand = parent?.type === "Property" && parent.shorthand && parent.value === identifier;

      return fixer.replaceTextRange(sourceCode.getRange(identifier), shorthand ? `${name}: ${API}` : API);
    }

    function bindingFix(call: EstreeNode): Rule.ReportFixer | undefined {
      const [container, declaration, declarator] = sourceCode.getAncestors(call).slice(-3);

      if (declarator?.type !== "VariableDeclarator" || declarator.init !== call || declarator.id.type !== "Identifier") return undefined;
      if (declaration?.type !== "VariableDeclaration" || declaration.kind !== "const" || declaration.declarations.length !== 1) return undefined;
      if (container?.type === "ExportNamedDeclaration") return undefined;

      const [variable] = sourceCode.getDeclaredVariables(declarator);

      if (!variable) return undefined;

      const { name } = variable;
      const references = variable.references.flatMap(({ identifier }) =>
        identifier.type === "Identifier" && identifier !== declarator.id ? [identifier] : [],
      );

      return (fixer) => [
        fixer.removeRange(lineRange(sourceCode, declaration, container)),
        ...[...references, ...templateReferences(variable)].map((identifier) => renameTo(fixer, identifier, name)),
      ];
    }

    function returnTypeRange(identifier: IdentifierNode): AST.Range | undefined {
      const [start, end] = sourceCode.getRange(identifier);
      const before = RETURN_TYPE_BEFORE.exec(sourceCode.text.slice(Math.max(0, start - 40), start));
      const after = RETURN_TYPE_AFTER.exec(sourceCode.text.slice(end));

      return before && after ? [start - before[0].length, end + after[0].length] : undefined;
    }

    function importFix(fixer: Rule.RuleFixer, specifier: ImportSpecifierNode) {
      const declaration = specifier.parent;
      const imported = declaration.type === "ImportDeclaration" && declaration.specifiers.some((other) => other.local.name === API);

      if (!imported) return fixer.replaceText(specifier, API);

      const after = sourceCode.getTokenAfter(specifier);
      const before = sourceCode.getTokenBefore(specifier);
      const [start, end] = sourceCode.getRange(specifier);

      if (after?.value === ",") return fixer.removeRange([start, sourceCode.getTokenAfter(after)?.range[0] ?? after.range[1]]);

      return fixer.removeRange([before?.value === "," ? before.range[0] : start, end]);
    }

    function report() {
      const taken = apiTaken(sourceCode.scopeManager);
      const manual = identifiers.filter((identifier) => {
        const { parent } = identifier;
        if (parent.type === "CallExpression" && parent.callee === identifier) return false;
        if (parent.type === "ImportSpecifier") return parent.local.name !== "useTRPC" || importSource(parent) !== "#imports";
        return !returnTypeRange(identifier);
      });

      for (const identifier of identifiers) {
        const { parent } = identifier;

        if (manual.includes(identifier)) {
          if (parent.type !== "ImportSpecifier") context.report({ node: identifier, messageId: "value" });
          else if (parent.local.name !== "useTRPC") context.report({ node: identifier, messageId: "renamed", data: { name: parent.local.name } });
          else context.report({ node: identifier, messageId: "imported", data: { source: importSource(parent) } });
          continue;
        }

        if (taken) {
          context.report({ node: identifier, messageId: "apiTaken" });
          continue;
        }

        if (parent.type === "CallExpression") {
          context.report({ node: parent, messageId: "replaced", fix: bindingFix(parent) ?? ((fixer) => fixer.replaceText(parent, API)) });
          continue;
        }

        if (parent.type === "ImportSpecifier") {
          if (manual.length === 0) context.report({ node: parent, messageId: "replaced", fix: (fixer) => importFix(fixer, parent) });
          continue;
        }

        const range = returnTypeRange(identifier);
        if (range) context.report({ node: identifier, messageId: "replaced", fix: (fixer) => fixer.replaceTextRange(range, `typeof ${API}`) });
      }

      for (const node of literals) context.report({ node, messageId: "named" });
    }

    const script: Rule.RuleListener = {
      "Identifier[name='useTRPC']"(node: IdentifierNode) {
        const { parent } = node;
        if (parent.type !== "ImportSpecifier" || !identifiers.some((other) => other.parent === parent)) identifiers.push(node);
      },
      "Literal[value='useTRPC']"(node: Rule.Node) {
        literals.push(node);
      },
      "Program:exit"() {
        report();
      },
    };
    const services: TemplateServices = sourceCode.parserServices;

    if (!services.defineTemplateBodyVisitor) return script;

    return services.defineTemplateBodyVisitor(
      {
        VExpressionContainer(node: TemplateContainer) {
          containers.push(node);
        },
      },
      script,
      { templateBodyTriggerSelector: "Program" },
    );
  },
};
