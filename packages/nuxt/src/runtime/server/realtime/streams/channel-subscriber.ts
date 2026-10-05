import type { Redis } from "ioredis";
import { quitRedis, useRedis } from "../../redis/client";
import {
  channelFromTopic,
  channelTopic,
  connectionFromTopic,
  connectionTopic,
  revokedSessionsTopic,
} from "./channel-topic";
import { closeOpenStreams, countOpenStreams, deliverToStreams } from "./open-streams";
import { parsePublished } from "./replay-buffer";

type CommandHandler = (data: string) => void;

let subscriber: Redis | undefined;
const commandHandlers = new Map<string, CommandHandler>();
const sessionClosers = new Map<string, Set<() => void>>();

function receive(topic: string, data: string) {
  if (topic === revokedSessionsTopic()) {
    for (const close of [...(sessionClosers.get(data) ?? [])]) close();
    return;
  }

  const connectionId = connectionFromTopic(topic);

  if (connectionId === undefined) {
    deliverToStreams(channelFromTopic(topic), parsePublished(data));
  } else {
    commandHandlers.get(connectionId)?.(data);
  }
}

function useSubscriber() {
  if (!subscriber) {
    subscriber = useRedis("pubsub").duplicate();
    subscriber.on("message", receive);
    subscriber.on("close", closeOpenStreams);
  }

  return subscriber;
}

export async function closeSubscriber() {
  const closing = subscriber;

  subscriber = undefined;
  commandHandlers.clear();
  sessionClosers.clear();
  if (closing) await quitRedis(closing);
}

export async function listenForBroadcasts(channel: string) {
  await useSubscriber().subscribe(channelTopic(channel));
}

export async function stopListeningWhenIdle(channel: string) {
  if (countOpenStreams(channel) === 0) {
    await useSubscriber().unsubscribe(channelTopic(channel));
  }
}

export async function listenForCommands(connectionId: string, handler: CommandHandler) {
  commandHandlers.set(connectionId, handler);
  await useSubscriber().subscribe(connectionTopic(connectionId));
}

export async function stopListeningForCommands(connectionId: string) {
  commandHandlers.delete(connectionId);
  await useSubscriber().unsubscribe(connectionTopic(connectionId));
}

export async function closeWhenSessionRevoked(sessionId: string, close: () => void) {
  const closers = sessionClosers.get(sessionId) ?? new Set();

  closers.add(close);
  sessionClosers.set(sessionId, closers);
  await useSubscriber().subscribe(revokedSessionsTopic());

  return () => {
    closers.delete(close);
    if (closers.size === 0 && sessionClosers.get(sessionId) === closers) sessionClosers.delete(sessionId);
  };
}
