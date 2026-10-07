import type { Rule, Scope } from "eslint";

/** The topic path of one public name of `@nuxvel/nuxt`, and whether the name is a type. */
export interface TopicImport {
  kind: "value" | "type";
  path: string;
}

/** The definition a member of a `$<kind>` namespace reaches: the file that holds it and the name to import. */
export interface DefinitionImport {
  path: string;
  name: string;
  /** Whether the file default-exports the definition, which drops the braces of the import. */
  isDefault: boolean;
}

/** What the rule needs to know about the app and the public names of nuxvel. */
export interface ExplicitImportsData {
  /** The topic import of each public name, by name. */
  topics: Map<string, TopicImport>;
  /** The definitions of each `$<kind>` namespace, by camelCase path under the root (`post.notifyFollowers`). */
  namespaces: Map<string, Map<string, DefinitionImport>>;
  /** The `#shared/schemas/...` specifier of every file of the app that exports each name, by name. */
  schemas: Map<string, string[]>;
}

/** The namespaces an app binds with a namespace import instead of an auto-import. */
const NAMESPACE_IMPORTS = ["$backfills", "$seeders"];

// the scope manager types its reference nodes as bare identifiers, and the parser adds `parent` to every node
function scopeNode(reference: Scope.Reference) {
  return reference.identifier as Rule.Node;
}

function memberChain(identifier: Rule.Node) {
  const chain: { name: string; node: Rule.Node }[] = [];
  let current = identifier;

  for (;;) {
    const parent = current.parent;
    if (parent?.type !== "MemberExpression" || parent.object !== current || parent.computed || parent.property.type !== "Identifier") break;
    chain.push({ name: parent.property.name, node: parent });
    current = parent;
  }

  return chain;
}

export function explicitImports(data: ExplicitImportsData): Rule.RuleModule {
  return {
    meta: {
      type: "problem",
      fixable: "code",
      docs: { description: "Imports each nuxvel name a file uses from its topic path, and rewrites the $<kind> namespaces to the imported definition." },
      messages: {
        imports: "no longer auto-imported: {{names}}, import each from its topic path of @nuxvel/nuxt",
        member: "{{path}} is no longer auto-imported: it is the definition, imported from its file",
        namespace: "{{path}} is not a definition: import the definition from its file and call it directly",
        root: "{{root}} is a namespace: import each definition from its file and call it directly",
        schema: "{{name}} is exported by {{files}}: import it from the file that exports it",
        declared: "{{name}} is already declared in this file: rewrite {{path}} by hand",
      },
      schema: [],
    },
    create(context) {
      const { sourceCode } = context;
      const words = new Set(sourceCode.text.match(/[$A-Za-z_][$\w]*/g) ?? []);

      if (![...words].some((word) => data.topics.has(word) || data.namespaces.has(word) || data.schemas.has(word))) return {};

      return {
        "Program:exit"(program) {
          const scope = sourceCode.getScope(program);
          const moduleScope = scope.type === "module" ? scope : scope.childScopes.find((child) => child.type === "module") ?? scope;
          const declared = new Set(moduleScope.set.keys());
          const byPath = new Map<string, { values: Set<string>; types: Set<string>; defaults: Set<string> }>();
          const added = new Set<string>();
          const roots = new Map<string, Rule.Node[]>();

          function add(kind: "value" | "type" | "default", path: string, name: string) {
            if (added.has(name)) return;
            added.add(name);
            const bucket = byPath.get(path) ?? { values: new Set<string>(), types: new Set<string>(), defaults: new Set<string>() };
            (kind === "type" ? bucket.types : kind === "default" ? bucket.defaults : bucket.values).add(name);
            byPath.set(path, bucket);
          }

          function root(rootName: string, identifier: Rule.Node) {
            const parent = identifier.parent;
            if (parent?.type === "ImportSpecifier" || parent?.type === "ImportDefaultSpecifier" || parent?.type === "ImportNamespaceSpecifier") return;
            roots.set(rootName, [...(roots.get(rootName) ?? []), identifier]);
          }

          for (const reference of scope.through) {
            const { name } = reference.identifier;
            if (declared.has(name)) continue;
            const topic = data.topics.get(name);
            if (topic) add(topic.kind, topic.path, name);
            else if (data.namespaces.has(name)) root(name, scopeNode(reference));
            else {
              const exports = data.schemas.get(name) ?? [];
              const [only, ...others] = exports;
              if (only && others.length === 0) add("value", only, name);
              else if (others.length > 0) {
                context.report({ node: program, loc: { line: 1, column: 0 }, messageId: "schema", data: { name, files: exports.join(" and ") } });
              }
            }
          }

          for (const name of NAMESPACE_IMPORTS) {
            for (const reference of moduleScope.set.get(name)?.references ?? []) root(name, scopeNode(reference));
          }

          for (const [rootName, identifiers] of roots) {
            const leaves = data.namespaces.get(rootName) ?? new Map<string, DefinitionImport>();

            for (const identifier of identifiers) {
              const chain = memberChain(identifier);
              const path = [rootName, ...chain.map(({ name }) => name)].join(".");
              let match: { leaf: DefinitionImport; node: Rule.Node } | undefined;

              for (let depth = chain.length; depth >= 1 && !match; depth -= 1) {
                const leaf = leaves.get(chain.slice(0, depth).map(({ name }) => name).join("."));
                const node = chain[depth - 1]?.node;
                if (leaf && node) match = { leaf, node };
              }

              const target = match;
              if (!target) {
                context.report({ node: identifier, messageId: chain.length === 0 ? "root" : "namespace", data: { root: rootName, path } });
                continue;
              }
              if (declared.has(target.leaf.name)) {
                context.report({ node: target.node, messageId: "declared", data: { name: target.leaf.name, path } });
                continue;
              }
              add(target.leaf.isDefault ? "default" : "value", target.leaf.path, target.leaf.name);
              context.report({
                node: target.node,
                messageId: "member",
                data: { path },
                fix: (fixer) => fixer.replaceText(target.node, target.leaf.name),
              });
            }
          }

          const lines = [...byPath]
            .sort(([left], [right]) => (left < right ? -1 : 1))
            .flatMap(([path, names]) => [
              ...(names.values.size > 0 ? [`import { ${[...names.values].sort().join(", ")} } from ${JSON.stringify(path)};`] : []),
              ...(names.types.size > 0 ? [`import type { ${[...names.types].sort().join(", ")} } from ${JSON.stringify(path)};`] : []),
              ...(names.defaults.size > 0 ? [...names.defaults].sort().map((name) => `import ${name} from ${JSON.stringify(path)};`) : []),
            ]);

          if (lines.length === 0) return;
          const imports = program.body.filter((statement) => statement.type === "ImportDeclaration");
          const lastImport = imports[imports.length - 1];
          const start = program.range?.[0] ?? 0;
          const text = lines.join("\n");

          context.report({
            node: program,
            loc: { line: 1, column: 0 },
            messageId: "imports",
            data: { names: [...added].join(", ") },
            fix: (fixer) => (lastImport ? fixer.insertTextAfter(lastImport, `\n${text}`) : fixer.insertTextBeforeRange([start, start], `${text}\n\n`)),
          });
        },
      };
    },
  };
}
