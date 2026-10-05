import { defineEventHandler, type H3Event } from "h3";
import { ForbiddenError } from "../errors/forbidden-error";
import { useLogger } from "../logging/logger";
import { auth } from "../utils/auth";
import type { Channel } from "./define-channel";
import { openEventStream } from "./streams/open-event-stream";

/** One server-sent event a {@link defineStreamHandler} sends. */
export interface StreamMessage {
  data: string;
  event?: string;
  id?: string;
}

/** What a {@link defineStreamHandler} handler writes to. */
export interface StreamWriter {
  /** Sends one event. A string is sent as the `data` of an unnamed event. */
  push: (message: string | StreamMessage) => Promise<void>;
  /** Runs `callback` once the stream ends, when the client leaves or the server closes it. */
  onClosed: (callback: () => void) => void;
}

/**
 * Defines a plain Nitro route that answers with a server-sent event
 * stream, for streams that are not a channel: AI token output, a public
 * live feed.
 *
 * Auto-imported on the server. Put it in a route file under
 * `server/api/` or `server/routes/`. The stream gets what a channel
 * connection gets: `authorize` runs first and a refusal is a `403`, the
 * `nuxvel.realtime.maxConnections` cap applies (a `429` past it), a
 * `ping` event goes out every 15 seconds, and the stream ends when the
 * server shuts down or the session that opened it ends. The stream
 * closes when `handler` resolves. An error it throws is logged and
 * closes the stream. Reach for {@link defineChannel} and
 * {@link broadcast} when many clients follow the same events.
 *
 * @param config.authorize Whether this request may open the stream. Gets
 * the signed-in `user`, or `null` for a guest.
 * @param config.handler Writes the events. Gets a {@link StreamWriter}
 * and the request's `H3Event`.
 *
 * @example
 * ```ts
 * // server/api/posts/[id]/summary.get.ts
 * export default defineStreamHandler({
 *   authorize: ({ user }) => user !== null,
 *   handler: async (stream, event) => {
 *     for await (const token of summarize(getRouterParam(event, "id"))) {
 *       await stream.push({ event: "token", data: token });
 *     }
 *   },
 * });
 * ```
 */
export function defineStreamHandler(config: {
  authorize: Channel["authorize"];
  handler: (stream: StreamWriter, event: H3Event) => unknown;
}) {
  return defineEventHandler(async (event) => {
    const session = await auth();

    if (!(await config.authorize({ user: session?.user ?? null, params: {} }))) {
      throw new ForbiddenError("Not allowed to open this stream");
    }

    const stream = await openEventStream(event, session);
    const writer: StreamWriter = {
      push: (message) => (typeof message === "string" ? stream.push(message) : stream.push(message)),
      onClosed: (callback) => stream.onClosed(callback),
    };

    void Promise.resolve()
      .then(() => config.handler(writer, event))
      .catch((error: unknown) => useLogger("realtime").error("A stream handler failed", error))
      .finally(() => stream.close());

    return stream.send();
  });
}
