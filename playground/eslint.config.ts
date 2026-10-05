import typescriptParser from "@typescript-eslint/parser";
import accessibility, { architecture } from "@nuxvel/nuxt/eslint";

export default [{ languageOptions: { parser: typescriptParser } }, ...accessibility, ...architecture];
