import type { z } from "zod";
import { awaitingName } from "../discovery/definition-name";
import { defaultAuthorize } from "../security/default-authorize";
import type { RoomParams } from "./registry";
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
  /**
   * Sends `event` with `payload` to every connection listening to this
   * channel, once the surrounding transaction commits. Outside a
   * transaction it sends now.
   *
   * The payload is validated against the event's schema at the call, so
   * a wrong payload throws a `ValidationFailedError` and rolls the
   * transaction back. Listeners receive the schema's output through
   * superjson, so a `Date` arrives as a `Date`. A send that fails after the commit is
   * logged, not thrown. It reaches the connections of every server
   * sharing the Redis, and the last 500 events per channel or room stay
   * there for a client that reconnects with `Last-Event-ID`.
   *
   * @param params Sends only to this room of the channel, such as
   * `{ boardId: 7 }`. Without it, the event goes to the channel itself.
   *
   * @example
   * ```ts
   * await $channels.posts.broadcast("created", post);
   * await $channels.board.broadcast("moved", { cardId: card.id }, { boardId: card.boardId });
   * ```
   */
  broadcast(...args: BroadcastArgs<Events, Params>): Promise<void>;
}

type BroadcastArgs<Events extends ChannelEvents, Params extends string> = {
  [Event in keyof Events & string]: [event: Event, payload: z.input<Events[Event]>, params?: RoomParams<Params>];
}[keyof Events & string];

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
 * `events` types the channel end to end: {@link Channel.broadcast} takes only
 * those event names, each with its schema's input and validated against
 * it, and `useChannel()` / `useLiveQuery()` receive each payload as the
 * schema's output. Payloads travel with superjson, as tRPC results do,
 * so a `Date`, `Map`, `Set` or `BigInt` arrives as the same type: a
 * row's schema describes the payload as it is.
 *
 * Without `authorize`, only a signed-in user may listen; `public: true`
 * lets a guest listen too. `authorize` runs before the stream opens, on every connection,
 * reconnects included, and again at each `ping` of an open connection.
 * When the session of an open connection no longer exists, or
 * `authorize` then refuses one of its channels, the server closes the
 * stream, and the client reconnects. A connection it rejects is answered `403`, never
 * opens and is replayed nothing. An accepted one is answered with an
 * open `text/event-stream` whose first event is `connected`, followed by
 * a `ping` event every 15 seconds so idle proxies keep it open. A
 * connection that sends a `Last-Event-ID` header, as the browser's
 * `EventSource` does when it reconnects, then receives the
 * events it missed, in order, before new ones. A
 * server that loses its Redis connection ends its open streams, so each
 * client reconnects and catches up that way.
 *
 * `params` names the params of the channel's rooms, such as
 * `["boardId"]`. A room is the channel with one value for each param:
 * {@link Channel.broadcast} with `params` sends only to that room, and
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
 * data only some users may see. Defaults to signed-in users only.
 * @param config.public `true` lets every connection listen, guests
 * included, when `authorize` is left out.
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
 * });
 *
 * // server/channels/status.channel.ts
 * export const statusChannel = defineChannel({
 *   events: { changed: z.object({ up: z.boolean() }) },
 *   public: true,
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
  config: {
    events: Events;
    authorize?: Channel["authorize"];
    public?: boolean;
    presence?: Presence;
    params?: readonly Params[];
  },
): Channel<string, Events, Presence, Params> {
  const channel: Channel<string, Events, Presence, Params> = awaitingName(
    {
      name: "",
      ...config,
      authorize: config.authorize ?? defaultAuthorize(config.public),
      async broadcast(event: string, payload?: unknown, params?: Record<string, string | number>) {
        // a static import cycles through the #nuxvel/channels registry, which holds this channel
        const { broadcastOnCommit } = await import("./broadcast");

        await broadcastOnCommit(channel, event, payload, params);
      },
    },
    "channel",
  );

  return channel;
}
