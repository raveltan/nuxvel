import { TaxonomyError } from "./taxonomy";

/**
 * Thrown by {@link authorize} when a policy denies the actor. Surfaces as
 * HTTP 403 (tRPC `FORBIDDEN`); its message survives production and it is
 * not reported as unexpected.
 */
export class ForbiddenError extends TaxonomyError {
  declare readonly code: "FORBIDDEN";

  constructor(message?: string) {
    super("FORBIDDEN", message);
  }
}
