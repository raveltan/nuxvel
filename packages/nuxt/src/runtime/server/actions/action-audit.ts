import { isDeepStrictEqual } from "node:util";
import { getTableName } from "drizzle-orm";
import { findRow, type IdentifiableTable } from "../database/find-or-fail";
import { audit } from "../utils/audit";

const IGNORED_COLUMNS = new Set(["createdAt", "updatedAt", "searchVector"]);

/**
 * The `audit` option of {@link defineAction}: the dotted name of the
 * audit row, such as `"post.updated"`, or `{ name, target }` to record
 * which columns of the `target` row with the id `input.id` changed.
 */
export type ActionAudit<Input, Output> =
  | (Output extends { id: unknown } ? string : never)
  | (Input extends { id: unknown } ? { name: string; target: IdentifiableTable } : never);

function diffRows(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const key of Object.keys(after)) {
    if (IGNORED_COLUMNS.has(key)) continue;
    if (!isDeepStrictEqual(before[key], after[key])) changes[key] = { from: before[key], to: after[key] };
  }

  return changes;
}

function idOf(value: unknown) {
  if (typeof value === "object" && value !== null && "id" in value) return value.id;

  throw new Error("defineAction: an action with audit: \"<name>\" must return a row with an id");
}

export async function runAudited<Output>(option: string | { name: string; target: IdentifiableTable }, input: unknown, run: () => Promise<Output>) {
  if (typeof option === "string") {
    const output = await run();
    await audit(option, { id: idOf(output) });

    return output;
  }

  const id = idOf(input);
  const before = await findRow(option.target, id, "include");
  const output = await run();
  const after = await findRow(option.target, id, "include");
  await audit(option.name, { type: getTableName(option.target), id }, { changes: diffRows(before, after) });

  return output;
}
