import { join } from "node:path";
import { addTemplate, addTypeTemplate } from "@nuxt/kit";
import type { Nuxt } from "@nuxt/schema";

const FILENAME = "nuxvel/form-inputs";

export function addFormInputs(nuxt: Nuxt, inputs: Record<string, string>) {
  const entries = Object.entries(inputs);
  const imports = entries.length ? `import { ${[...new Set(Object.values(inputs))].join(", ")} } from "#components";\n` : "";
  const body = entries.map(([kind, component]) => `${JSON.stringify(kind)}: ${component}`).join(", ");

  addTemplate({ filename: `${FILENAME}.mjs`, write: true, getContents: () => `${imports}export default { ${body} };\n` });
  addTemplate({
    filename: `${FILENAME}.d.ts`,
    write: true,
    getContents: () => `import type { Component } from "vue";\n\ndeclare const inputs: Partial<Record<string, Component>>;\nexport default inputs;\n`,
  });
  addTypeTemplate({
    filename: "types/nuxvel-action-form.d.ts",
    getContents: () =>
      `declare module "#build/ui" {\n  export const actionForm: { slots: { root: string; field: string; actions: string } };\n}\n\nexport {};\n`,
  });
  nuxt.options.alias["#nuxvel/form-inputs"] = join(nuxt.options.buildDir, FILENAME);
}
