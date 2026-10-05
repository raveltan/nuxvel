import appTranslations from "#nuxvel/translations";
import { useRuntimeConfig } from "nitropack/runtime";
import type { InjectionKey } from "vue";
import { nuxvelMessages } from "./nuxvel-messages";

/**
 * Gives the text of a translation key in one locale, with each `{param}`
 * replaced by its value. A key that no translation file has gives the key.
 */
export type Translate = (key: string, params?: Record<string, unknown>) => string;

export const translateKey: InjectionKey<Translate> = Symbol("nuxvel:translate");

const translations: Readonly<Record<string, readonly object[]>> = appTranslations;

function lookup(messages: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (typeof node === "object" && node !== null ? Reflect.get(node, part) : undefined), messages);
}

export function translator(locale: string): Translate {
  const fallbacks = new Set([locale, useRuntimeConfig().i18nLocales.defaultLocale, "en"]);
  const sources = [...fallbacks].flatMap((code) => [...(translations[code] ?? []), nuxvelMessages[code] ?? {}]);

  return (key, params = {}) => {
    for (const messages of sources) {
      const text = lookup(messages, key);
      if (typeof text === "string") return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
    }
    return key;
  };
}
