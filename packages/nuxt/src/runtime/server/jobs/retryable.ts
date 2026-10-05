import { UnrecoverableError } from "bullmq";
import { type TaxonomyCode, isKnownTaxonomyError, isTaxonomyError } from "../errors/taxonomy";

const RETRYABLE_CODES: ReadonlySet<TaxonomyCode> = new Set([
  "TOO_MANY_REQUESTS",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_SERVER_ERROR",
]);

/**
 * Whether another attempt at a failed job could succeed. A taxonomy
 * error that is the caller's fault (validation, auth, not found,
 * conflict, an action's `fail()`) fails the same way every time, and so
 * does a payload that no upcaster can carry to the current version, so
 * `nuxvel queue:work` fails the job at once instead of retrying it.
 */
export function isRetryableJobError(error: unknown): boolean {
  if (error instanceof UnrecoverableError) return false;

  return !isKnownTaxonomyError(error) || RETRYABLE_CODES.has(error.code);
}

export function isReportedJobError(error: unknown, retrying: boolean): boolean {
  if (isTaxonomyError(error, "SERVICE_UNAVAILABLE")) return !retrying;

  return !isKnownTaxonomyError(error) || isTaxonomyError(error, "INTERNAL_SERVER_ERROR");
}
