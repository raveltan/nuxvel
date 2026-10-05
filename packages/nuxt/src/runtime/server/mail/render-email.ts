/// <reference path="./mjml.d.ts" />
import { type SelectorDefinition, convert } from "html-to-text";
import mjmlCore, { type MjmlValidationError } from "mjml-core";
import presetCore from "mjml-preset-core";
import { type VNode, createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { type Translate, translateKey } from "../i18n/translator";
import { mailComponents } from "./mail-components";

// mjml-core is CommonJS with __esModule: Node's import gives module.exports, a bundler gives exports.default
const mjml2html = typeof mjmlCore === "function" ? mjmlCore : mjmlCore.default;

const textSelectors: SelectorDefinition[] = [
  { selector: "img", format: "skip" },
  { selector: "a", options: { linkBrackets: false } },
  { selector: "div[style*='display:none']", format: "skip" },
  { selector: "table", format: "block" },
  { selector: "tr", format: "block" },
  { selector: "td", format: "block" },
];

async function renderTemplate(vnode: VNode, t: Translate) {
  const app = createSSRApp({ render: () => vnode });

  app.provide(translateKey, t);
  app.config.globalProperties.$t = t;

  for (const [name, component] of Object.entries(mailComponents)) app.component(name, component);

  return (await renderToString(app)).replace(/<!--[\s\S]*?-->/g, "").replace(/<mj/g, "\n<mj");
}

function isValidationError(error: unknown): error is Error & { errors: MjmlValidationError[] } {
  return error instanceof Error && "errors" in error && Array.isArray(error.errors);
}

async function toHtml(mjml: string) {
  try {
    return (await mjml2html(mjml, { validationLevel: "strict", presets: [presetCore] })).html;
  } catch (error) {
    if (!isValidationError(error)) throw error;

    const lines = error.errors.map(({ line, tagName, message }) => `line ${line}, <${tagName}>: ${message}`);

    throw new Error(`The mail template renders invalid MJML:\n${lines.join("\n")}`, { cause: error });
  }
}

export async function renderEmail(vnode: VNode, t: Translate) {
  const html = await toHtml(await renderTemplate(vnode, t));
  const text = convert(html, { selectors: textSelectors }).replace(/\n{3,}/g, "\n\n");

  return { html, text: text.trim() };
}
