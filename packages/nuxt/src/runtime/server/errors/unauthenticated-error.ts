import { TaxonomyError } from "./taxonomy";

/**
 * Thrown by {@link requireAuth} when there is no session. Surfaces as
 * HTTP 401 (tRPC `UNAUTHORIZED`), from a procedure and from a plain Nitro
 * handler alike.
 */
export class UnauthenticatedError extends TaxonomyError {
  declare readonly code: "UNAUTHORIZED";

  constructor(message = "Not signed in") {
    super("UNAUTHORIZED", message);
  }
}
