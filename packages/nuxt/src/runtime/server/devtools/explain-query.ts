import type { ParameterOrJSON } from "postgres";
import { rootPool } from "../database/connection/pool";

type BindableParam = ParameterOrJSON<never>;

class RolledBack extends Error {
  constructor(readonly plan: string) {
    super("EXPLAIN ANALYZE rolled back");
  }
}

export function isBindable(value: unknown): value is BindableParam {
  if (value === null || value instanceof Date || value instanceof Uint8Array) return true;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isBindable);

  return typeof value === "object" && Object.values(value).every((item) => item === undefined || isBindable(item));
}

export async function explainQuery(sql: string, params: readonly BindableParam[]) {
  try {
    await rootPool().$client.begin(async (tx) => {
      const rows = await tx.unsafe(`explain (analyze, buffers) ${sql}`, [...params]);

      throw new RolledBack(rows.map((row) => String(row["QUERY PLAN"])).join("\n"));
    });
  } catch (error) {
    if (error instanceof RolledBack) return error.plan;
    throw error;
  }

  throw new Error("EXPLAIN ANALYZE committed instead of rolling back");
}
