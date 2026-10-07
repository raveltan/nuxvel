import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";

const project = process.argv[2] ?? "playground";
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

const PACKAGES = [
  "better-auth",
  "@better-auth",
  "kysely",
  "stripe",
  "bullmq",
  "ioredis",
  "nodemailer",
  "@aws-sdk",
  "drizzle-orm",
  "@faker-js",
];

const serverImports = JSON.parse(
  readFileSync("packages/nuxt/src/runtime/server/server-imports.json", "utf8"),
);
const nuxvelServerNames = new Set(Object.values(serverImports.values).flat());

function runVueTsc(args) {
  return execFileSync("npx", ["vue-tsc", "--noEmit", ...args], {
    cwd: project,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 128,
  });
}

function parseDiagnostics(text) {
  const pick = (label) => {
    const m = text.match(new RegExp(`^${label}:\\s*([\\d,]+)`, "m"));
    return m ? Number(m[1].replaceAll(",", "")) : null;
  };
  return { lines: pick("Lines of TypeScript"), memoryK: pick("Memory used") };
}

function packageCounts(files) {
  const counts = {};
  for (const pkg of PACKAGES) {
    counts[pkg] = 0;
  }
  for (const file of files) {
    const m = file.match(/node_modules\/(@[^/]+\/[^/]+|[^@/][^/]*)\//);
    const name = m?.[1];
    if (!name) continue;
    for (const pkg of PACKAGES) {
      if (name === pkg || (pkg.startsWith("@") && name.startsWith(pkg + "/"))) counts[pkg]++;
    }
  }
  return counts;
}

function makeService(configName, extraFiles = []) {
  const configPath = join(project, ".nuxt", configName);
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    { noEmit: true },
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
  );
  const host = ts.createCompilerHost(parsed.options, true);
  const fileNames = [...parsed.fileNames, ...extraFiles];
  const lsHost = {
    ...host,
    getScriptFileNames: () => fileNames,
    getScriptVersion: () => "0",
    getScriptSnapshot: (file) =>
      ts.sys.fileExists(file) ? ts.ScriptSnapshot.fromString(ts.sys.readFile(file)) : undefined,
    getCurrentDirectory: () => project,
    getCompilationSettings: () => parsed.options,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    getDefaultLibLocation: () => ts.getDefaultLibLocation(),
    getProjectReferences: () => parsed.projectReferences,
    useCaseSensitiveFileNames: () => host.useCaseSensitiveFileNames(),
  };
  const service = ts.createLanguageService(lsHost, ts.createDocumentRegistry(host.useCaseSensitiveFileNames(), project));
  return { service, program: service.getProgram() };
}

function benchCompletions(configName, benchFile, label) {
  const benchPath = join(project, benchFile);
  mkdirSync(join(benchPath, ".."), { recursive: true });
  writeFileSync(benchPath, "\n");
  try {
    const { service } = makeService(configName, [benchPath]);
    try {
      const position = 0;
      const coldStart = performance.now();
      const first = service.getCompletionsAtPosition(benchPath, position, {});
      const coldMs = Math.round(performance.now() - coldStart);
      if (!first) throw new Error(`no completions in ${label}`);
      const warmStart = performance.now();
      const warmSamples = [];
      let last = first;
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        last = service.getCompletionsAtPosition(benchPath, position, {});
        warmSamples.push(performance.now() - start);
      }
      const warmMs = Math.round(warmSamples.reduce((a, b) => a + b, 0) / warmSamples.length);
      const entries = last.entries;
      return {
        coldMs,
        warmMs,
        count: entries.length,
        nuxvelServerNames: entries.filter((e) => nuxvelServerNames.has(e.name)).length,
      };
    } finally {
      service.dispose();
    }
  } finally {
    rmSync(benchPath, { force: true });
  }
}

const listFiles = runVueTsc(["-p", ".nuxt/tsconfig.app.json", "--listFilesOnly"])
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.length > 0 && !l.startsWith("Warning"));

const diagnostics = parseDiagnostics(
  runVueTsc(["-p", ".nuxt/tsconfig.app.json", "--extendedDiagnostics"]),
);

const result = {
  project,
  files: listFiles.length,
  lines: diagnostics.lines,
  memoryMB: diagnostics.memoryK == null ? null : Math.round(diagnostics.memoryK / 1024),
  packageCounts: packageCounts(listFiles),
  app: benchCompletions("tsconfig.app.json", "app/utils/__bench.ts", "app"),
  server: benchCompletions("tsconfig.server.json", "server/utils/__bench.ts", "server"),
};

console.log(JSON.stringify(result, null, 2));
