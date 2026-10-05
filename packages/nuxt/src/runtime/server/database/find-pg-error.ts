export interface PgError {
  code: unknown;
  detail?: unknown;
  table_name?: unknown;
}

const MAX_CAUSE_DEPTH = 5;

export function findPgError(error: unknown, code: string, depth = 0): PgError | undefined {
  if (typeof error !== "object" || error === null || depth > MAX_CAUSE_DEPTH) return undefined;
  if ("code" in error && error.code === code) return error;

  return "cause" in error ? findPgError(error.cause, code, depth + 1) : undefined;
}
