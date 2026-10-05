import type { z } from "zod";
import { awaitingName } from "../discovery/definition-name";
import type { auth } from "../utils/auth";

/** The signed-in user a channel's `authorize` sees. */
export type ChannelUser = NonNullable<Awaited<ReturnType<typeof auth>>>["user"];

/**
 * What a channel's `authorize` sees: the user opening the connection, or
 * `null` when signed out, and the params of the room it joins.
 */
export interface ChannelConnection {
  user: ChannelUser | null;
  /** The params of the room, as strings, such as `{ id: "42" }` for `posts?id=42`. `{}` for the channel itself. */
  params: Record<string, string>;
}

/** The events a channel carries: a Zod schema per event name, describing its payload. */
export type ChannelEvents = Record<string, z.ZodType>;

/**
 * A channel's `presence` option: `true` to track who listens, or
 * `{ state }` to also let each member share a state its Zod object
 * describes, such as `{ typing: boolean }`.
 */
export type ChannelPresence = true | { state: z.ZodObject };

/**
 * A channel definition: its name, the events it carries, who may
 * listen to it, whether it tracks presence, and the param names of its
 * rooms. The name is its file's path under `server/channels/`.
 */
export interface Channel<
  Name extends string = string,
  Events extends ChannelEvents = ChannelEvents,
  Presence extends ChannelPresence | undefined = ChannelPresence | undefined,
  Params extends string = string,
> {
  readonly name: Name;
  events: Events;
  authorize: (connection: ChannelConnection) => boolean | Promise<boolean>;
  presence?: Presence;
  params?: readonly Params[];
}

/**
 * Defines a channel: a named stream of server-sent events the browser
 * listens to.
 *
 * `defineChannel` is auto-imported. One channel per file, under
 * `server/channels/`; the file is discovered and served at
 * `GET /api/channels/<name>`, so nothing registers it. Its path is the
 * channel's name (`server/channels/post/comments.channel.ts` is
 * `"post.comments"`), part of {@link ChannelName}.
 *
 * `events` types the channel end to end: {@link broadcast} takes only
 * those event names, each with its schema's input and validated against
 * it, and `useChannel()` / `useLiveQuery()` receive each payload as the
 * schema's output. Payloads travel as JSON, so describe them as they
 * arrive — a `Date` becomes a string; `z.date().transform((date) =>
 * date.toISOString())` says so.
 *
 * `authorize` runs before the stream opens, on every connection,
 * reconnects included, and again at each `ping` of an open connection.
 * When the session of an open connection no longer exists, or
 * `authorize` then refuses one of its channels, the server closes the
 * stream, and the client reconnects. A connection it rejects is answered `403`, never
 * opens and is replayed nothing. An accepted one is answered with an
 * open `text/event-stream` whose first event is `connected`, followed by
 * a `ping` event every 15 seconds so idle proxies keep it open. A
 * connection that sends a `Last-Event-ID` header, as the browser's
 * `EventSource` does when it reconnects, then receives the
 * {@link broadcast} events it missed, in order, before new ones. A
 * server that loses its Redis connection ends its open streams, so each
 * client reconnects and catches up that way.
 *
 * `params` names the params of the channel's rooms, such as
 * `["boardId"]`. A room is the channel with one value for each param:
 * {@link broadcast} with `params` sends only to that room, and
 * `useChannel()` and `useLiveQuery()` with `params` listen only to it.
 * They take exactly these params, so a wrong name fails to compile.
 * `authorize` runs for each room with that room's `params`, so it can
 * refuse one room and allow another. A room whose param names are not
 * these is not found.
 *
 * `presence` tracks which signed-in users listen to a room of the
 * channel; see {@link presenceOf} and `usePresence()`. A presence
 * channel without `params` accepts a room with any params. The `ping`
 * interval is also its heartbeat: `NUXVEL_REALTIME_HEARTBEAT_SECONDS`
 * changes it, and a member whose connection misses two heartbeats is
 * removed.
 *
 * @param config.events A Zod schema per event name the channel carries.
 * @param config.authorize Whether this connection may listen. Gets the
 * signed-in `user`, or `null` for a guest, and the room's `params` as
 * strings (`{}` for the channel itself). Check `params` when a room holds
 * data only some users may see.
 * @param config.presence `true`, or `{ state }` with a Zod object for
 * the state each member shares. Leave it out for no presence.
 * @param config.params The param names of the channel's rooms. Leave it
 * out for a channel without rooms.
 *
 * @example
 * ```ts
 * // server/channels/announcements.channel.ts
 * export const announcementsChannel = defineChannel({
 *   events: { published: z.object({ title: z.string() }) },
 *   authorize: ({ user }) => user !== null,
 * });
 *
 * // server/channels/board.channel.ts
 * export const boardChannel = defineChannel({
 *   events: { moved: z.object({ cardId: z.number() }) },
 *   params: ["boardId"],
 *   authorize: async ({ user, params }) => user !== null && (await canViewBoard(user, Number(params.boardId))),
 * });
 * ```
 */
export function defineChannel<
  Events extends ChannelEvents,
  Presence extends ChannelPresence | undefined = undefined,
  Params extends string = never,
>(
  config: { events: Events; authorize: Channel["authorize"]; presence?: Presence; params?: readonly Params[] },
): Channel<string, Events, Presence, Params> {
  return awaitingName({ name: "", ...config }, "channel");
}
