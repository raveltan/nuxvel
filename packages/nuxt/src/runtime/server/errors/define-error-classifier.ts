import { awaitingName } from "../discovery/definition-name";
import type { TaxonomyError } from "./taxonomy";

/**
 * An app's error classifier from {@link defineErrorClassifier}: its
 * name, and the function that maps a thrown error into the taxonomy.
 */
export interface ErrorClassifier<Name extends string = string> {
  readonly name: Name;
  readonly classify: (error: unknown) => TaxonomyError | undefined;
}

/**
 * Defines an error classifier that maps a library's errors into the
 * error taxonomy, named after its file.
 *
 * `defineErrorClassifier` is auto-imported. One classifier per file,
 * under `server/errors/`; the file is discovered. nuxvel calls every
 * classifier for an error that escapes an action, a procedure, a Nitro
 * handler or a job, before its own database and `$fetch` rules. The
 * first taxonomy error a classifier returns replaces the thrown error.
 * Return `undefined` to leave an error alone. A taxonomy error that is
 * thrown directly never reaches a classifier.
 *
 * @example
 * ```ts
 * // server/errors/payments.classifier.ts
 * export const paymentsClassifier = defineErrorClassifier((error) => {
 *   if (!(error instanceof PaymentsApiError)) return undefined;
 *   if (error.status === 429) return new RateLimitedError(error.message);
 *   if (error.code === "card_declined") return new ConflictError(error.message);
 *   return undefined;
 * });
 * ```
 */
export function defineErrorClassifier(classify: (error: unknown) => TaxonomyError | undefined): ErrorClassifier {
  return awaitingName({ name: "", classify }, "error classifier");
}
