import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { listFiles } from "./list-files";

const RUNTIME_DIR = fileURLToPath(new URL("../../src/runtime", import.meta.url));

const CANNOT_FIND_NAME = new Set([2304, 2552]);

const VUE_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
const VUE_GENERIC = /\bgeneric="([^"]*)"/;
const VUE_MACROS = ["defineProps", "defineEmits", "defineSlots", "defineOptions", "defineModel", "withDefaults"];

const REAL_GLOBALS = ["$fetch"];

type Checked = { source: string; allowed: Set<string> };

function checked(path: string): Checked {
  const source = readFileSync(path, "utf8");
  if (!path.endsWith(".vue")) return { source, allowed: new Set(REAL_GLOBALS) };

  const scripts = [...source.matchAll(VUE_SCRIPT)];
  const generics = scripts.flatMap(
    ([, attributes]) => VUE_GENERIC.exec(attributes ?? "")?.[1]?.split(",").map((name) => name.trim().split(/\s/)[0] ?? "") ?? [],
  );

  return {
    source: scripts.map(([, , script]) => script ?? "").join("\n"),
    allowed: new Set([...REAL_GLOBALS, ...VUE_MACROS, ...generics]),
  };
}

function unresolvedNames(files: Map<string, Checked>, lib: string[]) {
  const options: ts.CompilerOptions = {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib,
    types: ["node"],
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, onError) => {
    const file = files.get(name);
    return file
      ? ts.createSourceFile(name, file.source, languageVersion, true, ts.ScriptKind.TS)
      : getSourceFile(name, languageVersion, onError);
  };
  host.resolveModuleNameLiterals = (literals) => literals.map(() => ({ resolvedModule: undefined }));

  const program = ts.createProgram([...files.keys()], options, host);

  return program.getSourceFiles().flatMap((file) => {
    const entry = files.get(file.fileName);
    if (!entry) return [];

    return program.getSemanticDiagnostics(file).flatMap((diagnostic) => {
      if (!CANNOT_FIND_NAME.has(diagnostic.code) || diagnostic.start === undefined) return [];
      const name = file.text.slice(diagnostic.start, diagnostic.start + (diagnostic.length ?? 0));
      if (entry.allowed.has(name)) return [];

      const { line } = file.getLineAndCharacterOfPosition(diagnostic.start);
      return [`${file.fileName.replace(/\.vue\.ts$/, ".vue")}:${line + 1} ${name}`];
    });
  });
}

export function findUnimportedGlobals(dir: string = RUNTIME_DIR): string[] {
  const app = new Map<string, Checked>();
  const server = new Map<string, Checked>();

  for (const path of listFiles(dir)) {
    if (!/\.(ts|vue)$/.test(path) || path.endsWith(".d.ts")) continue;
    const target = relative(dir, path).startsWith(`app${sep}`) ? app : server;
    target.set(path.endsWith(".vue") ? `${path}.ts` : path, checked(path));
  }

  return [
    ...unresolvedNames(app, ["lib.es2023.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"]),
    ...unresolvedNames(server, ["lib.es2023.d.ts"]),
  ].map((finding) => relative(dir, finding));
}
