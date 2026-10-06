import type { z } from "zod";
import type { ObservedBroadcast } from "../../runtime/server/observe/channels";
import type { Channel, ChannelEvents, ChannelPresence } from "../../runtime/server/realtime/define-channel";
import type { PresenceParams } from "../../runtime/shared/realtime/presence-room";
import type { BroadcastPayload, ChannelEvent, ChannelName, ChannelParams, RoomParams } from "../../runtime/server/realtime/registry";
import { recordedEffects } from "../recorded";
import { expectNotRecorded, expectRecorded, includes } from "./records";

function channelName(nameOrChannel: string | Channel) {
  return typeof nameOrChannel === "string" ? nameOrChannel : nameOrChannel.name;
}

/**
 * Asserts that the app broadcast `event` on a channel during the test, with a payload whose fields include `match`, and returns the latest such broadcast.
 *
 * Sees a broadcast once Redis has the event, so a {@link Channel.broadcast} in a transaction counts after it commits. The payload is the one that the event's schema parsed. Cleared after every test by `@nuxvel/nuxt/testing/setup`. Use {@link expectNotBroadcast} for the opposite.
 *
 * @param channel A {@link ChannelName}, or the channel's definition or its stub from `#nuxvel/test-namespaces`.
 * @param event An event that the channel declares, so a misspelled event fails to compile.
 * @param match Payload fields typed by the event's schema. Defaults to any payload.
 * @param options.times How many matching broadcasts there must be, 1 or more.
 * @param options.params Only a broadcast to this room of the channel counts. The channel's {@link defineChannel} names the params, so a wrong param fails to compile. Without it, a broadcast to any room, or to none, counts.
 *
 * @example
 * ```ts
 * await expectBroadcast("posts", "updated", { id: post.id });
 * await expectBroadcast("board", "moved", { cardId: card.id }, { params: { boardId: board.id } });
 * ```
 */
export async function expectBroadcast<Name extends ChannelName, Event extends ChannelEvent<Name>>(
  channel: Name,
  event: Event,
  match?: Partial<BroadcastPayload<Name, Event>>,
  options?: { times?: number; params?: ChannelParams<Name> },
): Promise<ObservedBroadcast>;
export async function expectBroadcast<
  Events extends ChannelEvents,
  Event extends keyof Events & string,
  Params extends string = never,
>(
  channel: Channel<string, Events, ChannelPresence | undefined, Params>,
  event: Event,
  match?: Partial<z.input<Events[Event]>>,
  options?: { times?: number; params?: RoomParams<Params> },
): Promise<ObservedBroadcast>;
export async function expectBroadcast(
  nameOrChannel: string | Channel,
  event: string,
  match?: object,
  options: { times?: number; params?: PresenceParams } = {},
) {
  const channel = channelName(nameOrChannel);
  const { broadcasts } = await recordedEffects();
  const matchesPayload = includes(match);
  const matchesParams = includes(options.params);

  return expectRecorded(
    "expectBroadcast",
    `a "${event}" broadcast on ${channel}${options.params ? ` in room ${JSON.stringify(options.params)}` : ""} with ${JSON.stringify(match ?? {})}`,
    broadcasts,
    (broadcast) => broadcast.channel === channel && broadcast.event === event && matchesPayload(broadcast.payload) && matchesParams(broadcast.params),
    options.times,
  );
}

/**
 * Asserts that the app did not broadcast on a channel during the test. With `event`, only a broadcast of that event fails it. With `options.params`, only a broadcast to that room fails it. The opposite of {@link expectBroadcast}.
 *
 * @example
 * ```ts
 * await expectNotBroadcast("posts", "deleted");
 * await expectNotBroadcast("board", "moved", { params: { boardId: other.id } });
 * ```
 */
export async function expectNotBroadcast(
  channel: ChannelName | Channel,
  event?: string,
  options: { params?: PresenceParams } = {},
): Promise<void> {
  const name = channelName(channel);
  const { broadcasts } = await recordedEffects();
  const matchesParams = includes(options.params);

  expectNotRecorded(
    "expectNotBroadcast",
    `a broadcast${event === undefined ? "" : ` of "${event}"`} on ${name}${options.params ? ` in room ${JSON.stringify(options.params)}` : ""}`,
    broadcasts,
    (broadcast) => broadcast.channel === name && (event === undefined || broadcast.event === event) && matchesParams(broadcast.params),
  );
}
