import { z } from "zod";
import { ForbiddenError } from "../errors/forbidden-error";
import { ValidationFailedError } from "../errors/taxonomy";
import { useRedis } from "../redis/client";
import { redisKey } from "../redis/key";
import type { ChannelPresence, ChannelUser } from "./define-channel";
import { presenceTtlMs } from "./streams/keep-alive";
import { publishChannelMessage } from "./streams/publish-message";

interface Visitor {
  userId: string;
  name: string;
  avatar?: string;
}

/**
 * One user listening to a presence room, however many tabs they have
 * open: `connections` counts them.
 */
export interface PresenceMember<State = Record<string, unknown>> {
  userId: string;
  name: string;
  avatar?: string;
  state: State;
  connections: number;
}

function keys(room: string) {
  const prefix = redisKey(`nuxvel:presence:${room}`);

  return { seen: `${prefix}:seen`, visitors: `${prefix}:visitors`, state: `${prefix}:state` };
}

async function extend(room: string) {
  const redis = useRedis("pubsub");

  await Promise.all(Object.values(keys(room)).map((key) => redis.pexpire(key, presenceTtlMs())));
}

export async function presenceMembers(room: string): Promise<PresenceMember[]> {
  const redis = useRedis("pubsub");
  const { seen, visitors, state } = keys(room);
  const live = await redis.zrangebyscore(seen, Date.now(), "+inf");

  if (live.length === 0) return [];

  const [entries, states] = await Promise.all([redis.hmget(visitors, ...live), redis.hgetall(state)]);
  const members = new Map<string, PresenceMember>();

  for (const entry of entries) {
    if (entry === null) continue;

    const visitor: Visitor = JSON.parse(entry);
    const member = members.get(visitor.userId);

    if (member) member.connections += 1;
    else members.set(visitor.userId, { ...visitor, state: JSON.parse(states[visitor.userId] ?? "{}"), connections: 1 });
  }

  return [...members.values()];
}

async function announce(room: string, event: "presence.join" | "presence.leave" | "presence.update", userId: string) {
  const member = (await presenceMembers(room)).find((candidate) => candidate.userId === userId);

  await publishChannelMessage(room, event, { userId, member });
}

export async function leavePresence(room: string, connectionId: string) {
  const redis = useRedis("pubsub");
  const { seen, visitors, state } = keys(room);
  const entry = await redis.hget(visitors, connectionId);

  if (entry === null) return;

  const { userId }: Visitor = JSON.parse(entry);

  await redis.zrem(seen, connectionId);
  await redis.hdel(visitors, connectionId);

  const stays = (await presenceMembers(room)).some((member) => member.userId === userId);

  if (!stays) await redis.hdel(state, userId);
  await announce(room, stays ? "presence.update" : "presence.leave", userId);
}

async function removeExpired(room: string) {
  const expired = await useRedis("pubsub").zrangebyscore(keys(room).seen, "-inf", `(${Date.now()}`);

  for (const connectionId of expired) await leavePresence(room, connectionId);
}

export async function joinPresence(room: string, connectionId: string, user: ChannelUser) {
  const redis = useRedis("pubsub");
  const { seen, visitors } = keys(room);
  const visitor: Visitor = { userId: user.id, name: user.name, avatar: user.image ?? undefined };

  await removeExpired(room);

  const returning = (await presenceMembers(room)).some((member) => member.userId === user.id);

  await redis.hset(visitors, connectionId, JSON.stringify(visitor));
  await redis.zadd(seen, Date.now() + presenceTtlMs(), connectionId);
  await extend(room);
  await announce(room, returning ? "presence.update" : "presence.join", user.id);
}

export async function refreshPresence(room: string, connectionId: string) {
  await useRedis("pubsub").zadd(keys(room).seen, "XX", Date.now() + presenceTtlMs(), connectionId);
  await extend(room);
  await removeExpired(room);
}

export async function updatePresenceState(
  room: string,
  presence: ChannelPresence,
  { connectionId, userId, state }: { connectionId: string; userId: string; state: Record<string, unknown> },
) {
  const redis = useRedis("pubsub");
  const { visitors, state: stateKey } = keys(room);
  const entry = await redis.hget(visitors, connectionId);
  const visitor: Visitor | null = entry === null ? null : JSON.parse(entry);

  if (visitor?.userId !== userId) throw new ForbiddenError("That connection is not in this presence room");

  const schema = presence === true ? z.object({}) : presence.state;
  const current: Record<string, unknown> = JSON.parse((await redis.hget(stateKey, userId)) ?? "{}");
  const parsed = await schema.partial().safeParseAsync({ ...current, ...state });

  if (!parsed.success) throw new ValidationFailedError(parsed.error);

  await redis.hset(stateKey, userId, JSON.stringify(parsed.data));
  await announce(room, "presence.update", userId);
}
