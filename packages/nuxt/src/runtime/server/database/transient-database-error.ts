import { TransientError } from "../errors/taxonomy";

const TRANSIENT_CODES = new Set([
  "40001",
  "40P01",
  "55P03",
  "57014",
  "57P01",
  "57P02",
  "57P03",
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
  "CONNECTION_ENDED",
  "CONNECT_TIMEOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
]);

function transientCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "string") {
    if (TRANSIENT_CODES.has(error.code) || error.code.startsWith("08")) return error.code;
  }

  return "cause" in error ? transientCode(error.cause) : undefined;
}

export function toTransientDatabaseError(error: unknown): TransientError | undefined {
  const code = transientCode(error);

  return code ? new TransientError(`The database is briefly unavailable (${code}), try again`, { cause: error }) : undefined;
}
