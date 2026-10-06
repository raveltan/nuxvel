import type { TRPCError } from "@trpc/server";
import { isTaxonomyError } from "../errors/taxonomy";

export function retryAfterHeader({ errors }: { errors: TRPCError[] }): { headers?: Record<string, string> } {
  const retryAfter = Math.max(
    0,
    ...errors.map((error) => (isTaxonomyError(error, "TOO_MANY_REQUESTS") ? (error.retryAfter ?? 0) : 0)),
  );

  return retryAfter > 0 ? { headers: { "retry-after": String(retryAfter) } } : {};
}
