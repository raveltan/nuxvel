import { z } from "zod";
import { ConflictError, ValidationFailedError } from "../errors/taxonomy";
import { findPgError } from "./find-pg-error";
import { singleColumnKey } from "./pg-error";

export function toForeignKeyError(error: unknown): ConflictError | ValidationFailedError | undefined {
  const violation = findPgError(error, "23503");

  if (!violation) return undefined;

  if (typeof violation.detail === "string" && violation.detail.includes("is still referenced")) {
    return new ConflictError("Other rows still reference this row");
  }

  const field = singleColumnKey(violation);

  return new ValidationFailedError(
    new z.ZodError([{ code: "custom", path: field ? [field] : [], message: "does not exist", input: undefined }]),
  );
}
