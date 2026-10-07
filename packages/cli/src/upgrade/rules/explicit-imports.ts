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

/** A nuxvel component: the export to import and the topic path to import it from. */
export interface ComponentImport {
  name: string;
  path: string;
}

/** What the rule needs to know about the app and the public names of nuxvel. */
export interface ExplicitImportsData {
  /** The topic import of each public name, by name. */
  topics: Map<string, TopicImport>;
  /** The definitions of each `$<kind>` namespace, by camelCase path under the root (`post.notifyFollowers`). */
  namespaces: Map<string, Map<string, DefinitionImport>>;
  /** The `#shared/schemas/...` specifier of every file of the app that exports each name, by name. */
  schemas: Map<string, string[]>;
  /** The component to import for each tag in lowercase letters only (`actionform`), by tag. */
  components: Map<string, ComponentImport>;
  /** The string name of each member of a client namespace (`$flags`), by camelCase path (`checkout.oneClick`). */
  clientNamespaces: Map<string, Map<string, string>>;
}

/** The namespaces an app binds with a namespace import instead of an auto-import. */
const NAMESPACE_IMPORTS = ["$backfills", "$seeders"];

/** The client namespace each composable takes as its first argument. */
const CLIENT_COMPOSABLES: Record<string, string> = {
  useFlag: "$flags",
  useExperiment: "$experiments",
  useChannel: "$channels",
  usePresence: "$channels",
  useJobChannel: "$jobs",
};

/** The composable to reach for when a client namespace is used in any other way. */
const CLIENT_COMPOSABLE: Record<string, string> = {
  $flags: "useFlag",
  $experiments: "useExperiment",
  $channels: "useChannel",
  $jobs: "useJobChannel",
};

/** The subpaths that the topic paths replace. */
const OLD_SUBPATHS: Record<string, true> = {
  "@nuxvel/nuxt/storage": true,
  "@nuxvel/nuxt/queue": true,
  "@nuxvel/nuxt/redis": true,
  "@nuxvel/nuxt/billing": true,
};

interface TemplateNode {
  name?: string;
  type: string;
  parent?: TemplateNode;
  object?: TemplateNode;
  property?: TemplateNode;
  callee?: TemplateNode;
  arguments?: TemplateNode[];
  computed?: boolean;
  rawName?: string;
  range?: [number, number];
}

interface TemplateReference {
  id: TemplateNode & { name: string };
  variable?: unknown;
}

interface TemplateContainer {
  references?: TemplateReference[];
}

type TemplateServices = {
  defineTemplateBodyVisitor?: (
    template: Record<string, (node: never) => void>,
    script: Rule.RuleListener,
    options: { templateBodyTriggerSelector: "Program" },
  ) => Rule.RuleListener;
};

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

function templateMember(identifier: TemplateNode) {
  const names: string[] = [];
  let current = identifier;

  for (;;) {
    const parent = current.parent;
    if (parent?.type !== "MemberExpression" || parent.object !== current || parent.computed || parent.property?.name === undefined) break;
    names.push(parent.property.name);
    current = parent;
  }

  return { names, end: current };
}

export function explicitImports(data: ExplicitImportsData): Rule.RuleModule {
  return {
    meta: {
      type: "problem",
      fixable: "code",
      docs: { description: "Imports each nuxvel name a file uses from its topic path, imports nuxvel components, rewrites the $<kind> namespaces to the imported definition, and rewrites the client namespaces to their string name." },
      messages: {
        imports: "no longer auto-imported: {{names}}, import each from its topic path of @nuxvel/nuxt",
        member: "{{path}} is no longer auto-imported: it is the definition, imported from its file",
        namespace: "{{path}} is not a definition: import the definition from its file and call it directly",
        root: "{{root}} is a namespace: import each definition from its file and call it directly",
        schema: "{{name}} is exported by {{files}}: import it from the file that exports it",
        declared: "{{name}} is already declared in this file: rewrite {{path}} by hand",
        client: "{{path}} is a client namespace: pass its string name to {{composable}}()",
        script: "this file has a <script> block but no <script setup> block: add the imports to a new <script setup> block by hand",
        subpath: "{{source}} is replaced by the topic paths: import each name from {{path}}",
        subpathUnknown: "{{source}} is replaced by the topic paths: import each name from its topic path of @nuxvel/nuxt",
      },
      schema: [],
    },
    create(context) {
      const { sourceCode } = context;
      const isVue = context.filename.endsWith(".vue");
      const appSide = /(^|\/)(app|tests)\//.test(context.filename);
      const words = new Set(sourceCode.text.match(/[$A-Za-z_][$\w]*/g) ?? []);

      if (!isVue && ![...words].some((word) => data.topics.has(word) || data.namespaces.has(word) || data.schemas.has(word) || data.clientNamespaces.has(word))) return {};

      const containers: TemplateContainer[] = [];
      const elements: TemplateNode[] = [];
      const byPath = new Map<string, { values: Set<string>; types: Set<string>; defaults: Set<string> }>();
      const added = new Set<string>();
      const roots = new Map<string, Rule.Node[]>();
      let declaredNames: Set<string> | undefined;

      function declared(name: string) {
        if (!declaredNames) {
          const scope = sourceCode.getScope(sourceCode.ast);
          const moduleScope = scope.type === "module" ? scope : scope.childScopes.find((child) => child.type === "module") ?? scope;
          declaredNames = new Set(moduleScope.set.keys());
        }

        return declaredNames.has(name);
      }

      function add(kind: "value" | "type" | "default", path: string, name: string) {
        if (added.has(name)) return;
        added.add(name);
        const bucket = byPath.get(path) ?? { values: new Set<string>(), types: new Set<string>(), defaults: new Set<string>() };
        (kind === "type" ? bucket.types : kind === "default" ? bucket.defaults : bucket.values).add(name);
        byPath.set(path, bucket);
      }

      function root(rootName: string, identifier: Rule.Node) {
        roots.set(rootName, [...(roots.get(rootName) ?? []), identifier]);
      }

      function clientUse(rootName: string, keys: string[], range: [number, number], composable: string | undefined, quote: string) {
        const name = keys.length > 0 ? data.clientNamespaces.get(rootName)?.get(keys.join(".")) : undefined;

        if (composable !== undefined && CLIENT_COMPOSABLES[composable] === rootName && name !== undefined) {
          context.report({
            loc: sourceCode.getLocFromIndex(range[0]),
            messageId: "client",
            data: { path: `${rootName}.${keys.join(".")}`, composable },
            fix: (fixer) => fixer.replaceTextRange(range, `${quote}${name}${quote}`),
          });
          return;
        }

        context.report({
          loc: sourceCode.getLocFromIndex(range[0]),
          messageId: "client",
          data: { path: rootName, composable: CLIENT_COMPOSABLE[rootName] ?? "the composable" },
        });
      }

      function scriptClient(rootName: string, identifier: Rule.Node) {
        const chain = memberChain(identifier);
        const outer = chain.at(-1)?.node ?? identifier;
        const parent = outer.parent;
        const callee = parent?.type === "CallExpression" && parent.arguments[0] === outer ? parent.callee : undefined;

        clientUse(rootName, chain.map(({ name: key }) => key), sourceCode.getRange(outer), callee?.type === "Identifier" ? callee.name : undefined, '"');
      }

      function templateClient(rootName: string, identifier: TemplateNode) {
        const { names, end } = templateMember(identifier);
        const parent = end.parent;
        const callee = parent?.type === "CallExpression" && parent.arguments?.[0] === end ? parent.callee : undefined;
        const range = end.range ?? identifier.range;

        if (range) clientUse(rootName, names, range, callee?.type === "Identifier" ? callee.name : undefined, "'");
      }

      const script: Rule.RuleListener = {
        "Program:exit"(program) {
          const scope = sourceCode.getScope(program);
          const moduleScope = scope.type === "module" ? scope : scope.childScopes.find((child) => child.type === "module") ?? scope;

          for (const reference of scope.through) {
            const { name } = reference.identifier;
            if (declared(name)) continue;
            const topic = data.topics.get(name);
            if (topic) {
              add(topic.kind, topic.path, name);
              continue;
            }
            if (appSide && data.clientNamespaces.has(name)) {
              scriptClient(name, scopeNode(reference));
              continue;
            }
            if (data.namespaces.has(name)) {
              root(name, scopeNode(reference));
              continue;
            }
            const exports = data.schemas.get(name) ?? [];
            const [only, ...others] = exports;
            if (only && others.length === 0) add("value", only, name);
            else if (others.length > 0) {
              context.report({ loc: { line: 1, column: 0 }, messageId: "schema", data: { name, files: exports.join(" and ") } });
            }
          }

          for (const name of NAMESPACE_IMPORTS) {
            for (const reference of moduleScope.set.get(name)?.references ?? []) root(name, scopeNode(reference));
          }

          for (const element of elements) {
            if (typeof element.rawName !== "string") continue;
            const component = data.components.get(element.rawName.replace(/-/g, "").toLowerCase());
            if (component && !declared(component.name)) add("value", component.path, component.name);
          }

          for (const container of containers) {
            for (const reference of container.references ?? []) {
              if (reference.variable !== null) continue;
              const id = reference.id;
              const { name } = id;
              if (declared(name)) continue;
              const topic = data.topics.get(name);
              if (topic) {
                add(topic.kind, topic.path, name);
                continue;
              }
              if (appSide && data.clientNamespaces.has(name)) {
                templateClient(name, id);
                continue;
              }
              const exports = data.schemas.get(name) ?? [];
              const [only, ...others] = exports;
              if (only && others.length === 0) add("value", only, name);
              else if (others.length > 0) {
                context.report({ loc: { line: 1, column: 0 }, messageId: "schema", data: { name, files: exports.join(" and ") } });
              }
            }
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
              if (declared(target.leaf.name)) {
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

          for (const statement of program.body) {
            if (statement.type !== "ImportDeclaration") continue;
            const value = statement.source.value;
            if (typeof value !== "string" || !OLD_SUBPATHS[value]) continue;
            const names = statement.specifiers.flatMap((specifier) => (specifier.type === "ImportSpecifier" && specifier.imported.type === "Identifier" ? [specifier.imported.name] : []));
            const paths = new Set(names.flatMap((name) => {
              const topic = data.topics.get(name);

              return topic ? [topic.path] : [];
            }));

            const sourceStart = sourceCode.getRange(statement.source)[0];

            if (names.length === 0 || paths.size !== 1) {
              context.report({ loc: sourceCode.getLocFromIndex(sourceStart), messageId: "subpathUnknown", data: { source: value } });
              continue;
            }
            const [path] = paths;
            context.report({
              loc: sourceCode.getLocFromIndex(sourceStart),
              messageId: "subpath",
              data: { source: value, path },
              fix: (fixer) => fixer.replaceText(statement.source, JSON.stringify(path)),
            });
          }

          const lines = [...byPath]
            .sort(([left], [right]) => (left < right ? -1 : 1))
            .flatMap(([path, names]) => [
              ...(names.values.size > 0 ? [`import { ${[...names.values].sort().join(", ")} } from ${JSON.stringify(path)};`] : []),
              ...(names.types.size > 0 ? [`import type { ${[...names.types].sort().join(", ")} } from ${JSON.stringify(path)};`] : []),
              ...(names.defaults.size > 0 ? [...names.defaults].sort().map((name) => `import ${name} from ${JSON.stringify(path)};`) : []),
            ]);

          if (lines.length === 0) return;
          const text = lines.join("\n");
          const imports = program.body.filter((statement) => statement.type === "ImportDeclaration");
          const lastImport = imports[imports.length - 1];
          const start = program.range?.[0] ?? 0;
          const hasSetup = /<script\b[^>]*\bsetup\b/.test(sourceCode.text);
          const plainScript = /<script\b(?![^>]*\bsetup\b)[^>]*>/.test(sourceCode.text);

          if (isVue && !hasSetup) {
            if (plainScript) {
              context.report({ loc: { line: 1, column: 0 }, messageId: "script" });
              return;
            }
            const template = sourceCode.text.indexOf("<template");
            const at = template === -1 ? 0 : template;

            context.report({
              loc: { line: 1, column: 0 },
              messageId: "imports",
              data: { names: [...added].join(", ") },
              fix: (fixer) => fixer.insertTextBeforeRange([at, at], `<script setup lang="ts">\n${text}\n</script>\n\n`),
            });
            return;
          }

          context.report({
            loc: { line: 1, column: 0 },
            messageId: "imports",
            data: { names: [...added].join(", ") },
            fix: (fixer) => (lastImport ? fixer.insertTextAfter(lastImport, `\n${text}`) : fixer.insertTextBeforeRange([start, start], `${text}\n\n`)),
          });
        },
      };

      const services: TemplateServices = sourceCode.parserServices;

      if (!services.defineTemplateBodyVisitor) return script;

      return services.defineTemplateBodyVisitor(
        {
          VElement(node: TemplateNode) {
            elements.push(node);
          },
          VExpressionContainer(node: TemplateContainer) {
            containers.push(node);
          },
        },
        script,
        { templateBodyTriggerSelector: "Program" },
      );
    },
  };
}
