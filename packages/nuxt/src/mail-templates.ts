import { relative, sep } from "node:path";
import { resolveFiles } from "@nuxt/kit";

const TEMPLATE_PATH = /^(?:domains\/[^/]+\/)?mail\/templates\/(.+)\.vue$/;

function templateName(serverDir: string, file: string) {
  return TEMPLATE_PATH.exec(relative(serverDir, file).split(sep).join("/"))?.[1];
}

/**
 * Finds the mail templates of each server directory, in layer order: the
 * `.vue` files under `mail/templates/` and under
 * `domains/<domain>/mail/templates/`, each named by its path there
 * without `.vue`. In one server directory, `mail/templates/` beats a
 * domain folder, and two domain folders with one name stop the build. A
 * name an earlier layer has keeps that layer's file, so the app
 * overrides a layer's template.
 */
export async function discoverMailTemplates(serverDirs: string[]) {
  const templates = new Map<string, string>();

  for (const serverDir of serverDirs) {
    const own = new Map<string, string>();
    const fromDomains = new Map<string, string>();

    for (const file of await resolveFiles(serverDir, "mail/templates/**/*.vue")) {
      const name = templateName(serverDir, file);
      if (name) own.set(name, file);
    }
    for (const file of await resolveFiles(serverDir, "domains/*/mail/templates/**/*.vue")) {
      const name = templateName(serverDir, file);
      if (!name) continue;
      const other = fromDomains.get(name);
      if (other) throw new Error(`nuxvel: ${other} and ${file} both name the mail template "${name}"; rename one of them`);
      fromDomains.set(name, file);
      if (!own.has(name)) own.set(name, file);
    }
    for (const [name, file] of own) if (!templates.has(name)) templates.set(name, file);
  }

  return templates;
}

/** Builds `#nuxvel/mail-templates`: each discovered mail template's component, by its name. */
export function buildMailTemplatesModuleCode(templates: Map<string, string>) {
  const entries = [...templates];
  const imports = entries.map(([, file], index) => `import template${index} from ${JSON.stringify(file)};`);
  const fields = entries.map(([name], index) => `  ${JSON.stringify(name)}: template${index},`);

  return `${imports.join("\n")}\n\nexport default {\n${fields.join("\n")}\n};\n`;
}
