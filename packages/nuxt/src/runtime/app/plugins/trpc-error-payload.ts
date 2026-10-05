import { TRPCClientError } from "@trpc/client";
import { definePayloadPlugin, definePayloadReducer, definePayloadReviver } from "#app";

/**
 * Carries a `TRPCClientError` from the server render to the browser in
 * the Nuxt payload, so a query with `ssrCatchError: true` renders its
 * error state on the server and hydrates with the same error: its
 * message, its tRPC code and its `data`.
 */
export default definePayloadPlugin(() => {
  definePayloadReducer("TRPCClientError", (error) => error instanceof TRPCClientError && { message: error.message, shape: error.shape });
  definePayloadReviver("TRPCClientError", ({ message, shape }) => (shape ? TRPCClientError.from({ error: shape }) : new TRPCClientError(message)));
});
