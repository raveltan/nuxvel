import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Nuxt } from "@nuxt/schema";

export type RedirectTypes = (contents: string, file: string) => string;

type TsConfig = { compilerOptions?: { paths?: Record<string, string[]> } };
type TsReference = { types: string } | { path: string };

const PACKAGE_NAME = "@nuxvel/nuxt";
const SPECIFIER = /(["'])((?:\.{1,2}\/|\/)[^"'\n]*)\1/g;
const DECLARATION = /\.d\.m?ts$/;

function redirectSpecifiers(contents: string, file: string, from: string, to: string) {
  const dir = dirname(file);

  return contents.replace(SPECIFIER, (match, quote: string, specifier: string) => {
    const target = resolve(dir, specifier);
    if (!target.startsWith(from + sep)) return match;
    const moved = join(to, relative(from, target));
    const rewritten = isAbsolute(specifier) ? moved : relative(dir, moved);

    return `${quote}${rewritten.startsWith(".") || isAbsolute(rewritten) ? rewritten : `./${rewritten}`}${quote}`;
  });
}

function packagePaths(packageRoot: string, typesDir: string) {
  const { exports } = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as { exports: Record<string, { types?: string }> };
  const paths: Record<string, string[]> = {};

  for (const [subpath, { types }] of Object.entries(exports)) {
    if (!types?.startsWith("./dist/")) continue;
    paths[PACKAGE_NAME + subpath.slice(1)] = [join(typesDir, types.slice("./dist/".length))];
  }

  return paths;
}

function addPaths(tsConfig: TsConfig, paths: Record<string, string[]>) {
  tsConfig.compilerOptions ??= {};
  tsConfig.compilerOptions.paths = { ...tsConfig.compilerOptions.paths, ...paths };
}

function redirectReferences(references: TsReference[], typesDir: string) {
  for (const [index, reference] of references.entries()) {
    if ("types" in reference && reference.types === PACKAGE_NAME) references[index] = { path: join(typesDir, "types.d.mts") };
  }
}

function redirectWrittenFiles(dir: string, redirect: RedirectTypes) {
  for (const name of readdirSync(dir)) {
    if (!DECLARATION.test(name)) continue;
    const file = join(dir, name);
    const contents = readFileSync(file, "utf8");
    const rewritten = redirect(contents, file);
    if (rewritten !== contents) writeFileSync(file, rewritten);
  }
}

export function editorTypes(nuxt: Nuxt, runtimeDir: string): RedirectTypes | undefined {
  const packageRoot = dirname(dirname(runtimeDir));
  const typesDir = process.env.NUXVEL_EDITOR_TYPES_DIR ?? join(packageRoot, ".types");
  if (!nuxt.options.dev || !existsSync(typesDir)) return undefined;

  const typesRuntimeDir = join(typesDir, "runtime");
  const redirect: RedirectTypes = (contents, file) => redirectSpecifiers(contents, file, runtimeDir, typesRuntimeDir);
  const paths = packagePaths(packageRoot, typesDir);

  const redirected = new WeakSet<object>();
  nuxt.hook("app:templates", (app) => {
    for (const template of app.templates) {
      const { getContents } = template;
      if (!getContents || !template.filename || !DECLARATION.test(template.filename) || redirected.has(template)) continue;
      redirected.add(template);
      const file = template.dst ?? join(nuxt.options.buildDir, template.filename);
      template.getContents = async (data) => redirect(await getContents(data), file);
    }
  });

  nuxt.hook("prepare:types", ({ references, nodeReferences, tsConfig, nodeTsConfig, sharedTsConfig }) => {
    redirectReferences(references, typesDir);
    redirectReferences(nodeReferences, typesDir);
    for (const config of [tsConfig, nodeTsConfig, sharedTsConfig]) addPaths(config, paths);
  });

  nuxt.hook("nitro:init", (nitro) => {
    nitro.hooks.hook("types:extend", ({ tsConfig }) => {
      if (tsConfig) addPaths(tsConfig, paths);
    });
    // nitro writes its types without a hook after the write, before rollup finishes the build that fires `compiled`
    nitro.hooks.hook("compiled", () => redirectWrittenFiles(join(nitro.options.buildDir, "types"), redirect));
  });

  return redirect;
}
