import { getTableName, isTable } from "drizzle-orm";
import * as schema from "#nuxvel/schema";

type SchemaExport = (typeof schema)[keyof typeof schema];

export type SchemaTable<Name extends string> = Extract<SchemaExport, { _: { name: Name } }>;

function isTableNamed<Name extends string>(candidate: SchemaExport, name: Name): candidate is SchemaTable<Name> {
  return isTable(candidate) && getTableName(candidate) === name;
}

export function schemaTable<Name extends string>(name: Name): SchemaTable<Name> {
  for (const candidate of Object.values(schema)) {
    if (isTableNamed(candidate, name)) return candidate;
  }

  throw new Error(`nuxvel: the app schema has no table named "${name}"`);
}
