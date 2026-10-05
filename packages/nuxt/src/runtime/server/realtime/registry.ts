import type { z } from "zod";
import channels from "#nuxvel/channels";
import { jobChannelName, jobFromChannelName } from "../../shared/realtime/job-channel";
import { userFromNotificationChannel } from "../../shared/realtime/notification-channel";
import { presenceRoomChannel, presenceRoomParams } from "../../shared/realtime/presence-room";
import { allJobs, findJob } from "../jobs/registry";
import type { Channel, ChannelEvents, ChannelPresence } from "./define-channel";

type Discovered = (typeof channels)[number];

type EventsOf<Name extends ChannelName> = Extract<Discovered, Channel<Name>>["events"];

type SchemaOf<Name extends ChannelName, Event extends ChannelEvent<Name>> =
  EventsOf<Name>[Event] extends z.ZodType ? EventsOf<Name>[Event] : never;

/** The name of every channel defined under `server/channels/`, the built-in `flags` and `maintenance` included. */
export type ChannelName = Discovered["name"];

/** The events the channel named `Name` declares in its `events`. */
export type ChannelEvent<Name extends ChannelName> = keyof EventsOf<Name> & string;

/** What {@link broadcast} takes for `Event` on the channel `Name`: its schema's input type. */
export type BroadcastPayload<
  Name extends ChannelName,
  Event extends ChannelEvent<Name>,
> = z.input<SchemaOf<Name, Event>>;

/**
 * What a listener on the channel named `Name` receives: one
 * `{ event, payload }` per declared event, the payload typed as that
 * event schema's output.
 */
export type ChannelMessage<Name extends ChannelName> = EventsMessage<EventsOf<Name>>;

/** What a listener on a channel with the given `events` receives; see {@link ChannelMessage}. */
export type EventsMessage<Events extends ChannelEvents> = {
  [Event in keyof Events & string]: { event: Event; payload: z.output<Events[Event]> };
}[keyof Events & string];

type PresenceOf<Name extends ChannelName> = Exclude<Extract<Discovered, Channel<Name>>["presence"], undefined>;

/** The name of every channel whose `defineChannel` sets `presence`. */
export type PresenceChannelName = {
  [Name in ChannelName]: [PresenceOf<Name>] extends [never] ? never : Name;
}[ChannelName];

/**
 * The state a member of the channel `Name` shares: a partial of its
 * `presence.state` schema's output, or an empty object for
 * `presence: true`.
 */
export type PresenceState<Name extends PresenceChannelName> = PresenceStateOf<PresenceOf<Name>>;

/** The `presence` option of a channel definition, or `never` when it sets none. */
export type DefinitionPresence<Definition> =
  Definition extends Channel<string, ChannelEvents, infer Presence> ? Exclude<Presence, undefined> : never;

/** The state a member shares, from a channel's `presence` option; see {@link PresenceState}. */
export type PresenceStateOf<Presence> =
  Presence extends { state: infer Schema extends z.ZodObject } ? Partial<z.output<Schema>> : Record<string, never>;

type ParamNamesOf<Definition> =
  Definition extends Channel<string, ChannelEvents, ChannelPresence | undefined, infer Params> ? Params : never;

/**
 * The params of one room of a channel whose `defineChannel` names
 * `Params` in `params`: a value for each name, such as `{ boardId: 7 }`,
 * or `never` when the channel names no params.
 */
export type RoomParams<Params extends string> = [Params] extends [never] ? never : Record<Params, string | number>;

/** What {@link broadcast}, `useChannel()` and `useLiveQuery()` take as `params` for the channel `Name`; see {@link RoomParams}. */
export type ChannelParams<Name extends ChannelName> = RoomParams<ParamNamesOf<Extract<Discovered, Channel<Name>>>>;

function definitions(): readonly Channel[] {
  return channels;
}

function jobChannel(name: string): Channel | undefined {
  const target = jobFromChannelName(name);
  const job = findJob(target?.job ?? "");

  if (!job?.channel) return undefined;

  const { authorize } = job.channel;
  const userId = target?.userId;

  return {
    name,
    events: {},
    authorize:
      userId === undefined ? authorize : async (connection) => connection.user?.id === userId && (await authorize(connection)),
  };
}

function notificationChannel(name: string): Channel | undefined {
  const userId = userFromNotificationChannel(name);

  return userId ? { name, events: {}, authorize: ({ user }) => user?.id === userId } : undefined;
}

/**
 * The channel with this name — one defined under `server/channels/`,
 * the `job:<name>` channel of a job with a `channel` option, or its
 * `job:<name>:<userId>` channel that only that user may listen to, the
 * `notifications:<userId>` channel only that user may listen to, or the
 * channel of a room key such as `posts?id=42` when that channel names
 * exactly these params in `params`, or names none and sets `presence` —
 * or `undefined` when none exists.
 *
 * The `GET /api/channels/<name>` endpoint
 * uses it to find the channel to authorize; see {@link defineChannel}.
 */
export function findChannel(name: string): Channel | undefined {
  const roomChannel = presenceRoomChannel(name);

  if (roomChannel !== undefined) {
    const channel = definitions().find((definition) => definition.name === roomChannel);

    return channel && hasRoom(channel, Object.keys(presenceRoomParams(name))) ? channel : undefined;
  }

  return definitions().find((channel) => channel.name === name) ?? jobChannel(name) ?? notificationChannel(name);
}

function hasRoom({ params, presence }: Channel, names: string[]) {
  if (!params) return presence !== undefined;

  return names.length === params.length && params.every((param) => names.includes(param));
}

/** Whether this key is a room of a channel that sets `presence`, such as `posts?id=42`. */
export function isPresenceRoom(key: string) {
  return presenceRoomChannel(key) !== undefined && findChannel(key)?.presence !== undefined;
}

/**
 * Every channel: each one defined under `server/channels/`, the built-in
 * `flags` included, then the `job:<name>` channel of each job with a
 * `channel` option (the per-user `job:<name>:<userId>` channels are left out). What `nuxvel channels` lists. The per-user
 * `notifications:<userId>` channels are left out.
 */
export function allChannels(): readonly Channel[] {
  return [...definitions(), ...allJobs().flatMap((job) => jobChannel(jobChannelName(job.name)) ?? [])];
}
