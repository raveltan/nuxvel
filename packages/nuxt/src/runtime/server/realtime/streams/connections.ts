import { randomUUID } from "node:crypto";
import type { EventStream } from "h3";
import { channelEventName } from "../../../shared/realtime/channel-request";
import { presenceRoomParams } from "../../../shared/realtime/presence-room";
import { findSession } from "../../utils/auth";
import type { ChannelUser } from "../define-channel";
import { joinPresence, leavePresence, presenceMembers, refreshPresence } from "../presence";
import { catchUpDelivery } from "./catch-up";
import {
  listenForBroadcasts,
  listenForCommands,
  stopListeningForCommands,
  stopListeningWhenIdle,
} from "./channel-subscriber";
import { parseConnectionCommand } from "./connection-commands";
import { MAX_CHANNELS } from "../max-connections";
import { findChannel, isPresenceRoom } from "../registry";
import { holdStream, releaseStream } from "./open-streams";
import { eventsAfter, latestEventId } from "./replay-buffer";

interface Connection {
  stream: EventStream;
  channels: Set<string>;
  multiplexed: boolean;
  user: ChannelUser | null;
}

const connections = new Map<string, Connection>();

function receiveCommand(connectionId: string, data: string) {
  const command = parseConnectionCommand(data);

  if (command?.type === "join") {
    void joinChannel(connectionId, command.channel, command.lastEventId);
  } else if (command?.type === "leave") {
    void leaveChannel(connectionId, command.channel);
  }
}

function forget(connectionId: string, connection: Connection) {
  connections.delete(connectionId);

  for (const channel of connection.channels) {
    releaseStream(channel, connection.stream);
    void stopListeningWhenIdle(channel);
    if (isPresenceRoom(channel)) void leavePresence(channel, connectionId);
  }

  connection.channels.clear();
  if (connection.multiplexed) void stopListeningForCommands(connectionId);
}

export async function holdConnection(
  stream: EventStream,
  { multiplexed, user }: { multiplexed: boolean; user: ChannelUser | null },
) {
  const connectionId = randomUUID();
  const connection: Connection = { stream, channels: new Set(), multiplexed, user };

  connections.set(connectionId, connection);
  stream.onClosed(() => forget(connectionId, connection));

  if (multiplexed) {
    await listenForCommands(connectionId, (data) => receiveCommand(connectionId, data));
  }

  return connectionId;
}

export async function startJoiningChannel(
  connectionId: string,
  channel: string,
  lastEventId: string | undefined,
) {
  const connection = connections.get(connectionId);

  if (!connection || connection.channels.has(channel)) return async () => {};

  if (connection.channels.size >= MAX_CHANNELS) {
    void connection.stream.push({ event: "refused", data: JSON.stringify({ channel }) });
    return async () => {};
  }

  connection.channels.add(channel);

  const eventName = connection.multiplexed ? channelEventName(channel) : undefined;
  const delivery = catchUpDelivery(connection.stream, lastEventId, eventName);

  holdStream(channel, connection.stream, delivery.deliver);
  await listenForBroadcasts(channel);
  if (connection.user && isPresenceRoom(channel)) {
    await joinPresence(channel, connectionId, connection.user);
  }

  return async () => {
    if (isPresenceRoom(channel)) {
      const id = await latestEventId(channel);
      const data = JSON.stringify({ event: "presence.sync", payload: { members: await presenceMembers(channel) } });

      void connection.stream.push(eventName === undefined ? { id, data } : { id, event: eventName, data });
    }
    if (!lastEventId) return delivery.catchUp([]);

    const { events, missed } = await eventsAfter(channel, lastEventId);

    if (missed) void connection.stream.push({ event: "resync", data: JSON.stringify({ channel }) });
    delivery.catchUp(events);
  };
}

async function joinChannel(
  connectionId: string,
  channel: string,
  lastEventId: string | undefined,
) {
  const catchUp = await startJoiningChannel(connectionId, channel, lastEventId);

  await catchUp();
}

async function leaveChannel(connectionId: string, channel: string) {
  const connection = connections.get(connectionId);

  if (!connection?.channels.delete(channel)) return;

  releaseStream(channel, connection.stream);
  await stopListeningWhenIdle(channel);
  if (isPresenceRoom(channel)) await leavePresence(channel, connectionId);
}

export async function refreshConnectionPresence(connectionId: string) {
  const rooms = [...(connections.get(connectionId)?.channels ?? [])].filter(
    (channel) => isPresenceRoom(channel),
  );

  await Promise.all(rooms.map((room) => refreshPresence(room, connectionId)));
}

async function stillAllowed(connection: Connection, headers: Headers) {
  const session = await findSession(headers, { disableRefresh: true });

  if (connection.user && !session) return false;

  const user = session?.user ?? null;

  for (const channel of connection.channels) {
    if (!(await findChannel(channel)?.authorize({ user, params: presenceRoomParams(channel) }))) return false;
  }

  return true;
}

export async function reauthorizeConnection(connectionId: string, headers: Headers) {
  const connection = connections.get(connectionId);

  if (connection && !(await stillAllowed(connection, headers).catch(() => false))) await connection.stream.close();
}
