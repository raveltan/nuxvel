import type { core } from "zod";

/**
 * Wire shape of a failed input validation: one entry per invalid field,
 * keyed by dotted path.
 */
export interface ValidationError {
  code: "VALIDATION_ERROR";
  message: string;
  fields: Record<string, string[]>;
}

/**
 * Flattens a `ZodError` into the {@link ValidationError} wire shape
 * without throwing — what {@link useActionForm} shows for a schema that
 * fails in the browser. To fail a request with it, throw
 * {@link ValidationFailedError}, which carries the same `fields`.
 */
export function toValidationError(zodError: core.$ZodError): ValidationError {
  const fields: Record<string, string[]> = {};

  for (const issue of zodError.issues) {
    const key = issue.path.join(".");
    (fields[key] ??= []).push(issue.message);
  }

  return { code: "VALIDATION_ERROR", message: "Invalid input", fields };
}
