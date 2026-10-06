import { basename, isAbsolute, relative, sep } from "node:path";
import { KIND_SUFFIXES } from "@nuxvel/nuxt/cli";
import typescriptParser from "@typescript-eslint/parser";
import { architecture } from "@nuxvel/nuxt/eslint/architecture";
import { ESLint, type Linter } from "eslint";
import { glob } from "tinyglobby";
import vueParser from "vue-eslint-parser";
import type { AppLayout } from "../app-layout/load-app-layout.ts";
import { lintTranslations } from "./lint-translations.ts";

const LINTED_FOLDERS: [folder: string, config: string][] = [
  ["actions", "nuxvel/actions"],
  ["trpc/routers", "nuxvel/routers"],
  ["listeners", "nuxvel/listeners"],
  ["api", "nuxvel/routes"],
  ["routes", "nuxvel/routes"],
  ["database/schema", "nuxvel/schema"],
  [".", "nuxvel/audit"],
  [".", "nuxvel/billing"],
];

export const ARCHITECTURE_FOLDERS = [...new Set([...LINTED_FOLDERS.map(([folder]) => folder), ...Object.keys(KIND_SUFFIXES)])];

function insideProject(cwd: string, file: string) {
  const path = relative(cwd, file);

  return !isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`);
}

export function tsConfig(config: Linter.Config): Linter.Config {
  return { ...config, files: ["**/*.ts"], languageOptions: { parser: typescriptParser } };
}

export function vueConfig(config: Linter.Config): Linter.Config {
  return { ...config, files: ["**/*.vue"], languageOptions: { parser: vueParser, parserOptions: { parser: typescriptParser } } };
}

async function lint(cwd: string, files: string[], config: Linter.Config | Linter.Config[], findings: Set<string>) {
  const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: config });

  for (const result of await eslint.lintFiles(files)) {
    for (const message of result.messages) {
      if (message.fatal || message.ruleId?.startsWith("nuxvel/") || message.ruleId === "no-restricted-imports") {
        findings.add(`${relative(cwd, result.filePath)}: ${message.message}`);
      }
    }
  }
}

function suffixWarnings(cwd: string, layout: AppLayout) {
  const warnings: string[] = [];

  for (const [folder, suffixes] of Object.entries(KIND_SUFFIXES)) {
    for (const file of (layout.files[folder] ?? []).filter((file) => insideProject(cwd, file))) {
      if (suffixes.some((suffix) => file.endsWith(`.${suffix}.ts`))) continue;

      const renames = suffixes.map((suffix) => basename(file).replace(/\.ts$/, `.${suffix}.ts`));

      warnings.push(`${relative(cwd, file)}: add the kind suffix, rename it to ${renames.join(" or ")}`);
    }
  }

  return warnings;
}

export async function lintArchitecture(cwd: string, layout: AppLayout) {
  const findings = new Set<string>();

  for (const [folder, name] of LINTED_FOLDERS) {
    const config = architecture.find((candidate) => candidate.name === name);
    const files = (layout.files[folder] ?? []).filter((file) => insideProject(cwd, file));

    if (!config || files.length === 0) continue;

    await lint(cwd, files, tsConfig(config), findings);
  }

  const translations = await lintTranslations(cwd, layout);
  const templateRules = architecture.find((candidate) => candidate.name === "nuxvel/templates");
  const templates = templateRules && {
    ...templateRules,
    rules: {
      ...templateRules.rules,
      "nuxvel/translation-keys": ["error", { locale: layout.translations.defaultLocale, keys: translations.keys }] satisfies Linter.RuleEntry,
    },
  };
  const appFiles = layout.appFiles.filter((file) => insideProject(cwd, file));

  const appVue = appFiles.filter((file) => file.endsWith(".vue"));
  const appTs = appFiles.filter((file) => file.endsWith(".ts"));

  if (templates && appVue.length > 0) {
    await lint(cwd, appVue, vueConfig(templates), findings);
  }

  if (templates && appTs.length > 0) {
    await lint(cwd, appTs, tsConfig(templates), findings);
  }

  const modules = architecture.find((candidate) => candidate.name === "nuxvel/modules");
  const moduleFiles = await glob("layers/*/**/*.{ts,vue}", {
    cwd,
    absolute: true,
    ignore: ["**/node_modules/**", "**/.nuxt/**", "**/.output/**"],
  });
  const moduleTs = moduleFiles.filter((file) => file.endsWith(".ts"));
  const moduleVue = moduleFiles.filter((file) => file.endsWith(".vue"));

  if (modules && moduleTs.length > 0) {
    await lint(cwd, moduleTs, tsConfig(modules), findings);
  }

  if (modules && moduleVue.length > 0) {
    await lint(cwd, moduleVue, vueConfig(modules), findings);
  }

  const testConfigs = architecture.filter((candidate) => candidate.name === "nuxvel/tests" || candidate.name === "nuxvel/functional-tests");
  const testFiles = await glob(
    ["tests/**/*.ts", "server/**/*.test.ts", "app/**/*.stories.ts"].flatMap((path) => [path, `layers/*/${path}`]),
    { cwd, absolute: true, ignore: ["**/node_modules/**", "**/.nuxt/**", "**/.output/**"] },
  );

  if (testFiles.length > 0) {
    await lint(cwd, testFiles, [{ files: ["**/*.ts"], languageOptions: { parser: typescriptParser } }, ...testConfigs], findings);
  }

  const imports = architecture.find((candidate) => candidate.name === "nuxvel/imports");
  const importFiles = await glob(
    ["server", "app", "shared", "tests"].flatMap((root) => [`${root}/**/*.{ts,vue}`, `layers/*/${root}/**/*.{ts,vue}`]),
    { cwd, absolute: true, ignore: ["**/node_modules/**", "**/.nuxt/**", "**/.output/**", "**/*.d.ts"] },
  );

  if (imports && importFiles.length > 0) {
    await lint(cwd, importFiles, [tsConfig(imports), vueConfig(imports)], findings);
  }

  for (const finding of translations.findings) findings.add(finding);

  return { findings: [...findings], warnings: suffixWarnings(cwd, layout) };
}
