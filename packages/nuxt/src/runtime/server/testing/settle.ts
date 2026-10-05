import { captureSqlQueries } from "../database/query-counter";

export interface SerializedError {
  name: string;
  message: string;
  [field: string]: unknown;
}

export type Settled<Data = unknown> = { queries: string[] } & (
  | { ok: true; data: Data }
  | { ok: false; error: SerializedError }
);

function serializeError(error: unknown): SerializedError {
  if (!(error instanceof Error)) return { name: "Error", message: String(error) };

  const fields = Object.entries(error).filter(([key]) => key !== "cause" && key !== "stack");

  return { ...Object.fromEntries(fields), name: error.name, message: error.message };
}

export async function settle(fn: () => Promise<unknown>): Promise<Settled> {
  let outcome: { ok: true; data: unknown } | { ok: false; error: SerializedError } = {
    ok: true,
    data: undefined,
  };

  const queries = await captureSqlQueries(async () => {
    try {
      outcome = { ok: true, data: await fn() };
    } catch (error) {
      outcome = { ok: false, error: serializeError(error) };
    }
  });

  return { ...outcome, queries };
}
