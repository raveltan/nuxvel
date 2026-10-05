import { toForeignKeyError } from "../database/foreign-key-violation";
import { toTransientDatabaseError } from "../database/transient-database-error";
import { toConflictError } from "../database/unique-violation";
import { classifyWithApp } from "./classifier-registry";
import { toFetchTaxonomyError } from "./fetch-error";
import { type TaxonomyError, isKnownTaxonomyError } from "./taxonomy";

export function classifyError(error: unknown): TaxonomyError | undefined {
  if (isKnownTaxonomyError(error)) return undefined;

  return (
    classifyWithApp(error) ??
    toConflictError(error) ??
    toForeignKeyError(error) ??
    toFetchTaxonomyError(error) ??
    toTransientDatabaseError(error)
  );
}
