import type { z } from "zod";
import { actorContext } from "../actions/context";
import { systemActor } from "../actions/system-actor";
import { requireSignature } from "../security/signed-url";
import { publicProcedure } from "./procedures";

/**
 * Procedure for a link from {@link signedUrl} that works without a
 * sign-in, such as a "view your request" link in an email.
 *
 * Auto-imported on the server. Everything {@link publicProcedure} does,
 * then it parses `input` and calls {@link requireSignature} on the
 * path from `path`, with the `expires` and `signature` of the input
 * added to its query. A missing, changed or expired link throws
 * `FORBIDDEN`. The procedure body then runs as a {@link systemActor}:
 * `ctx.actor` is that actor and `ctx.user` is `null`, also for a
 * signed-in caller. An action that the body calls without an actor
 * runs as that system actor. Add more fields with `.input()` after it.
 *
 * @param options.input The schema of the link fields. It must include
 * `expires` and `signature`, as strings.
 * @param options.path The path that {@link signedUrl} signed, made
 * from the input, without `expires` and `signature`. Encode a string
 * field with `encodeURIComponent`. A path that the URL parser changes
 * throws `FORBIDDEN`.
 * @param options.actor The name of the system actor. Audit rows and
 * traces show it.
 *
 * @example
 * ```ts
 * const requesterLink = signedProcedure({
 *   input: requesterLinkInput,
 *   path: ({ ticketId }) => `/requests/${ticketId}`,
 *   actor: "requester-link",
 * });
 *
 * export const ticketsPublicRouter = {
 *   reply: requesterLink
 *     .input(requesterReplyInput)
 *     .mutation(({ input }) => addRequesterReplyAction(input)),
 * };
 * ```
 */
export function signedProcedure<TInput extends { expires: string; signature: string }>(options: {
  input: z.ZodType<TInput>;
  path: (input: TInput) => string;
  actor: string;
}) {
  const actor = systemActor(options.actor);

  return publicProcedure.input(options.input).use(({ input, next }) => {
    const path = options.path(input);
    const url = new URL(path, "http://signed.invalid");
    url.searchParams.set("expires", input.expires);
    url.searchParams.set("signature", input.signature);
    requireSignature(path.split("?")[0] + url.search);

    return actorContext.run(actor, () => next({ ctx: { user: null, actor } }));
  });
}
