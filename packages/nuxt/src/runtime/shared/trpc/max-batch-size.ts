/**
 * The most calls one tRPC batch request can carry. The handler refuses a
 * bigger batch with `BAD_REQUEST`, and the client link splits its calls
 * into batches of this size.
 */
export const TRPC_MAX_BATCH_SIZE = 10;
