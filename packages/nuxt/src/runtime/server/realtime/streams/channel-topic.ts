import { useRedis } from "../../redis/client";
import { redisKey } from "../../redis/key";

function topicPrefix(kind: "channel" | "connection" | "session") {
  // Redis pub/sub ignores the DB index, so the topic carries it to keep apps on one Redis apart.
  return redisKey(`nuxvel:${kind}:${useRedis("pubsub").options.db ?? 0}:`);
}

export function channelTopic(channel: string) {
  return `${topicPrefix("channel")}${channel}`;
}

export function channelFromTopic(topic: string) {
  return topic.slice(topicPrefix("channel").length);
}

export function connectionTopic(connectionId: string) {
  return `${topicPrefix("connection")}${connectionId}`;
}

export function connectionFromTopic(topic: string) {
  const prefix = topicPrefix("connection");

  return topic.startsWith(prefix) ? topic.slice(prefix.length) : undefined;
}

export function revokedSessionsTopic() {
  return `${topicPrefix("session")}revoked`;
}
