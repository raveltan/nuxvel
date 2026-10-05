import { ConflictError } from "../errors/taxonomy";
import { findPgError } from "./find-pg-error";
import { singleColumnKey } from "./pg-error";

export function toConflictError(error: unknown): ConflictError | undefined {
  const violation = findPgError(error, "23505");

  if (!violation) return undefined;

  return new ConflictError("A row with this value already exists", {
    field: singleColumnKey(violation),
  });
}
