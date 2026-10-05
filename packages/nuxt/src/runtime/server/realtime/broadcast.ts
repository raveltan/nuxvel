import type { z } from "zod";
import { onCommit } from "../database/transaction";
import { ValidationFailedError } from "../errors/taxonomy";
import { publishObserved } from "../observe/channels";
import { type PresenceParams, presenceRoom } from "../../shared/realtime/presence-room";
import type { Channel, ChannelEvents, ChannelPresence } from "./define-channel";
import {
  type BroadcastPayload,
  type ChannelEvent,
  type ChannelName,
  type ChannelParams,
  type RoomParams,
  findChannel,
} from "./registry";
import { publishChannelMessage } from "./streams/publish-message";

/**
 * Sends an event to every connection currently listening to a channel,
 * given by its name or its definition.
 *
 * Auto-imported on the server, and in `queue:work` jobs and `tinker`.
 * `channel` is a {@link ChannelName} or the channel's definition
 * (`$channels.posts` or an import), `event` one of the events its
 * {@link defineChannel} declares, and `payload` that event's
 * {@link BroadcastPayload}, so a misspelled name or a wrong payload fails
 * to compile. The payload is validated against the event's schema first
 * (async refinements and transforms included),
 * throwing the same {@link ValidationFailedError} an action throws, and
 * the schema's output is what listeners receive.
 *
 * It publishes through `useRedis("pubsub")`, so it reaches the
 * connections held by every server process sharing that Redis, whichever
 * process calls it. It resolves once Redis has the event; each server
 * writes it to its own connections right after. A channel nobody is
 * listening to drops the event, apart from the replay buffer: the last
 * 500 events per channel stay in Redis, each with an ID, so a client
 * reconnecting with `Last-Event-ID` catches up on what it missed. A
 * client that missed older events too first gets a `resync` event, and
 * `useLiveQuery()` refetches.
 * The payload is serialized as plain JSON, not superjson, so a `Date`
 * arrives as an ISO string.
 * With `params`, the event goes only to that room of the channel, such as
 * `{ boardId: 7 }`, and the room has its own replay buffer. The channel's
 * {@link defineChannel} names the params, so a wrong param fails to
 * compile. Without `params`, the event goes to the listeners of the
 * channel itself, and to no room.
 * Connections are opened, and authorized, by the channel's
 * {@link defineChannel}; the browser listens with `useChannel()`.
 * Inside a transaction, such as in an action, use
 * {@link broadcastAfterCommit} so a rolled-back write sends nothing.
 *
 * @example
 * ```ts
 * await broadcast("announcements", "published", { title: post.title });
 * await broadcast($channels.announcements, "published", { title: post.title });
 * await broadcast($channels.board, "moved", { cardId: card.id }, { boardId: card.boardId });
 * ```
 */
export async function broadcast<Name extends ChannelName, Event extends ChannelEvent<Name>>(
  channel: Name,
  event: Event,
  payload: BroadcastPayload<Name, Event>,
  params?: ChannelParams<Name>,
): Promise<void>;
export async function broadcast<
  Events extends ChannelEvents,
  Event extends keyof Events & string,
  Params extends string = never,
>(
  channel: Channel<string, Events, ChannelPresence | undefined, Params>,
  event: Event,
  payload: z.input<Events[Event]>,
  params?: RoomParams<Params>,
): Promise<void>;
export async function broadcast(
  nameOrChannel: string | Channel,
  event: string,
  payload: unknown,
  params?: PresenceParams,
): Promise<void> {
  const message = await validatedMessage(nameOrChannel, event, payload, params);

  await publish(message);
}

/**
 * Sends an event like {@link broadcast}, but only once the surrounding
 * transaction commits, so no listener hears about a rolled-back write.
 *
 * Auto-imported on the server. Reach for it in an action or any code
 * inside {@link transaction}: an action runs in a transaction, so a
 * plain `broadcast()` there sends the event before the write commits.
 * The payload is validated at the call, so a wrong payload throws the
 * {@link ValidationFailedError} inside the transaction and rolls it back.
 * The send itself runs as an {@link onCommit} hook: outside a
 * transaction it sends at once, and a failed send after the commit is
 * logged, not thrown. `params` sends to one room, as for {@link broadcast}.
 *
 * @example
 * ```ts
 * await broadcastAfterCommit("tickets.ticket", "updated", { id: ticket.id });
 * await broadcastAfterCommit($channels.board, "moved", { cardId: card.id }, { boardId: card.boardId });
 * ```
 */
export async function broadcastAfterCommit<Name extends ChannelName, Event extends ChannelEvent<Name>>(
  channel: Name,
  event: Event,
  payload: BroadcastPayload<Name, Event>,
  params?: ChannelParams<Name>,
): Promise<void>;
export async function broadcastAfterCommit<
  Events extends ChannelEvents,
  Event extends keyof Events & string,
  Params extends string = never,
>(
  channel: Channel<string, Events, ChannelPresence | undefined, Params>,
  event: Event,
  payload: z.input<Events[Event]>,
  params?: RoomParams<Params>,
): Promise<void>;
export async function broadcastAfterCommit(
  nameOrChannel: string | Channel,
  event: string,
  payload: unknown,
  params?: PresenceParams,
): Promise<void> {
  const message = await validatedMessage(nameOrChannel, event, payload, params);

  await onCommit(() => publish(message));
}

async function validatedMessage(nameOrChannel: string | Channel, event: string, payload: unknown, params?: PresenceParams) {
  const channel = typeof nameOrChannel === "string" ? nameOrChannel : nameOrChannel.name;
  const key = params === undefined ? channel : presenceRoom(channel, params);
  const schema = findChannel(key)?.events[event];

  if (!schema) throw new Error(`Channel "${key}" has no event "${event}"`);

  const parsed = await schema.safeParseAsync(payload);

  if (!parsed.success) throw new ValidationFailedError(parsed.error);

  return { channel, key, event, payload: parsed.data, params };
}

async function publish({ channel, key, event, payload, params }: Awaited<ReturnType<typeof validatedMessage>>) {
  await publishChannelMessage(key, event, payload);
  publishObserved("realtime:broadcast", { channel, event, payload, params });
}
