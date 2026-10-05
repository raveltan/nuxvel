import type { AppRoutes, RouteSchema } from "@nuxvel/nuxt/cli";

type Procedure = AppRoutes["procedures"][number];

function fieldsOf(schema: RouteSchema | boolean | null, prefix = ""): Map<string, boolean> {
  const fields = new Map<string, boolean>();

  if (typeof schema !== "object" || schema === null) return fields;

  for (const part of schema.allOf ?? []) for (const [path, required] of fieldsOf(part, prefix)) fields.set(path, required);

  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    const path = `${prefix}${name}`;

    fields.set(path, schema.required?.includes(name) ?? false);
    for (const [nested, required] of fieldsOf(property, `${path}.`)) fields.set(nested, required);
  }

  return fields;
}

function procedureChanges(before: Procedure, after: Procedure) {
  const inputBefore = fieldsOf(before.input);
  const inputAfter = fieldsOf(after.input);
  const outputAfter = fieldsOf(after.output);

  return [
    ...[...inputBefore.keys()].filter((field) => !inputAfter.has(field)).map((field) => `input field "${field}" removed`),
    ...[...inputAfter]
      .filter(([field, required]) => required && inputBefore.get(field) !== true)
      .map(([field]) => `input field "${field}" is now required`),
    ...[...fieldsOf(before.output).keys()].filter((field) => !outputAfter.has(field)).map((field) => `output field "${field}" removed`),
  ].map((change) => `${after.path}: ${change}`);
}

export function breakingChanges(before: Procedure[], after: Procedure[]) {
  return before.flatMap((procedure) => {
    const current = after.find((candidate) => candidate.path === procedure.path);

    return current ? procedureChanges(procedure, current) : [`${procedure.path}: removed or renamed`];
  });
}
