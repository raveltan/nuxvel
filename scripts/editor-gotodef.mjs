import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join, relative, resolve } from "node:path";

const [projectArg = "playground", fileArg, marker] = process.argv.slice(2);
const project = resolve(projectArg);
if (!fileArg || !marker) {
  console.error("usage: node scripts/editor-gotodef.mjs [project] <file> <marker>");
  process.exit(2);
}
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

const absFile = isAbsolute(fileArg) ? fileArg : join(project, fileArg);
const isVue = absFile.endsWith(".vue");
const configName = absFile.includes(`${join(project, "server")}`) ? "tsconfig.server.json" : "tsconfig.app.json";

let content;
let probeFile;
let tempFile;

if (isVue) {
  const source = readFileSync(absFile, "utf8");
  const m = source.match(/<script\s+setup[^>]*>([\s\S]*?)<\/script>/);
  if (!m) {
    console.error(`no script setup block in ${absFile}`);
    process.exit(1);
  }
  content = m[1];
  probeFile = join(absFile, "..", "__gotodef.ts");
  tempFile = probeFile;
  writeFileSync(probeFile, content);
} else {
  content = readFileSync(absFile, "utf8");
  probeFile = absFile;
}

const index = content.indexOf(marker);
if (index < 0) {
  if (tempFile) rmSync(tempFile, { force: true });
  console.error(`marker not found in ${absFile}: ${marker}`);
  process.exit(1);
}
const position = index + marker.length;

try {
  const configPath = join(project, ".nuxt", configName);
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    { noEmit: true },
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
  );
  const host = ts.createCompilerHost(parsed.options, true);
  const fileNames = [...parsed.fileNames, probeFile];
  const service = ts.createLanguageService(
    {
      ...host,
      getScriptFileNames: () => fileNames,
      getScriptVersion: () => "0",
      getScriptSnapshot: (f) =>
        ts.sys.fileExists(f) ? ts.ScriptSnapshot.fromString(ts.sys.readFile(f)) : undefined,
      getCurrentDirectory: () => project,
      getCompilationSettings: () => parsed.options,
      getDefaultLibFileName: ts.getDefaultLibFilePath,
      getDefaultLibLocation: () => ts.getDefaultLibLocation(),
      getProjectReferences: () => parsed.projectReferences,
      useCaseSensitiveFileNames: () => host.useCaseSensitiveFileNames(),
    },
    ts.createDocumentRegistry(host.useCaseSensitiveFileNames(), project),
  );

  try {
    const definitions = service.getDefinitionAtPosition(probeFile, position) ?? [];
    const out = definitions.map((d) => {
      const sf = ts.createSourceFile(d.fileName, ts.sys.readFile(d.fileName) ?? "", ts.ScriptTarget.Latest, true);
      const pos = sf.getLineAndCharacterOfPosition(d.textSpan.start);
      return {
        file: relative(project, d.fileName),
        line: pos.line + 1,
        text: (sf.text.split("\n")[pos.line] ?? "").trim(),
      };
    });
    console.log(JSON.stringify({ marker, definitions: out }, null, 2));
    if (out.length === 0) process.exit(1);
  } finally {
    service.dispose();
  }
} finally {
  if (tempFile) rmSync(tempFile, { force: true });
}
