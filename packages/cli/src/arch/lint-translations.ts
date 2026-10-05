import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { glob } from "tinyglobby";
import type { AppLayout } from "../app-layout/load-app-layout.ts";
import { isRecord } from "../is-record.ts";

function readMessages(file: string): Record<string, unknown> {
  const messages: unknown = JSON.parse(readFileSync(file, "utf8"));

  return isRecord(messages) ? messages : {};
}

function leafTexts(messages: Record<string, unknown>, prefix = ""): Map<string, string> {
  return new Map(
    Object.entries(messages).flatMap(([key, value]) =>
      isRecord(value) ? [...leafTexts(value, `${prefix}${key}.`)] : [[`${prefix}${key}`, JSON.stringify(value)] as const],
    ),
  );
}

function keyPaths(messages: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) => [`${prefix}${key}`, ...(isRecord(value) ? keyPaths(value, `${prefix}${key}.`) : [])]);
}

function ownLayerRoots(cwd: string, layout: AppLayout) {
  return layout.layerRoots.filter((root) => {
    const path = relative(cwd, root);

    return !path.startsWith("..") && !path.split(/[\\/]/).includes("node_modules");
  });
}

async function defaultLocaleFiles(dir: string, locale: string) {
  return existsSync(dir) ? glob(`**/${locale}.json`, { cwd: dir, absolute: true }) : [];
}

function missingLocaleFindings(cwd: string, defaultFile: string, locales: string[]) {
  const keys = [...leafTexts(readMessages(defaultFile)).keys()];
  const findings: string[] = [];

  for (const locale of locales) {
    const file = join(dirname(defaultFile), `${locale}.json`);

    if (!existsSync(file)) {
      findings.push(`${relative(cwd, file)}: missing, translate ${relative(cwd, defaultFile)} into it`);
      continue;
    }

    const translated = leafTexts(readMessages(file));
    const missing = keys.filter((key) => !translated.has(key));

    if (missing.length > 0) findings.push(`${relative(cwd, file)}: missing ${missing.join(", ")}, which ${relative(cwd, defaultFile)} has`);
  }

  return findings;
}

function conflictFindings(cwd: string, files: string[]) {
  const definitions = new Map<string, { file: string; text: string }[]>();

  for (const file of files) {
    for (const [key, text] of leafTexts(readMessages(file))) definitions.set(key, [...(definitions.get(key) ?? []), { file, text }]);
  }

  return [...definitions]
    .filter(([, found]) => new Set(found.map(({ text }) => text)).size > 1)
    .map(([key, found]) => `${key} has a different text in ${found.map(({ file }) => relative(cwd, file)).join(" and ")}, give each meaning its own key`);
}

export async function lintTranslations(cwd: string, layout: AppLayout) {
  const { defaultLocale, locales, dir, additionalDirs } = layout.translations;
  const otherLocales = [...new Set(locales)].filter((locale) => locale !== defaultLocale);
  const findings: string[] = [];
  const globalFiles: string[] = [];

  for (const root of ownLayerRoots(cwd, layout)) {
    const translationDir = join(root, dir);

    for (const file of await defaultLocaleFiles(translationDir, defaultLocale)) {
      findings.push(...missingLocaleFindings(cwd, file, otherLocales));
      if (dirname(file) === translationDir) globalFiles.push(file);
    }
  }

  findings.push(...conflictFindings(cwd, globalFiles));

  const keys = new Set<string>();

  for (const root of layout.layerRoots) {
    for (const translationDir of [dir, ...additionalDirs]) {
      for (const file of await defaultLocaleFiles(join(root, translationDir), defaultLocale)) {
        for (const key of keyPaths(readMessages(file))) keys.add(key);
      }
    }
  }

  return { findings, keys: [...keys] };
}
