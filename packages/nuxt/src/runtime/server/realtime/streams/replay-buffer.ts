import { useRedis } from "../../redis/client";
import { redisKey } from "../../redis/key";
import { redisNow } from "../../redis/now";
import { isAfter } from "./catch-up";
import { isPresenceRoom } from "../registry";
import { channelTopic } from "./channel-topic";
import { presenceTtlMs } from "./keep-alive";
import type { ChannelEvent } from "./open-streams";

export const REPLAY_LENGTH = 500;

const REPLAY_TTL_SECONDS = 86400;

const PUBLISH_SCRIPT = `
local id = redis.call("XADD", KEYS[1], "MAXLEN", ARGV[1], "*", "data", ARGV[2])
redis.call("PEXPIRE", KEYS[1], ARGV[4])
redis.call("PUBLISH", ARGV[3], id .. "\\n" .. ARGV[2])
return id
`;

const READ_AFTER_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 0 then return { {}, false } end
local info = redis.call("XINFO", "STREAM", KEYS[1])
local fields = {}
for index = 1, #info, 2 do fields[info[index]] = info[index + 1] end
local trimmed = fields["entries-added"] > fields["length"] and 1 or 0
return { redis.call("XRANGE", KEYS[1], "(" .. ARGV[1], "+"), fields["recorded-first-entry-id"], trimmed }
`;

type StreamEntry = [id: string, fields: string[]];

function replayKey(channel: string) {
  return redisKey(`nuxvel:channel:${channel}:replay`);
}

function replayTtlMs(channel: string) {
  return isPresenceRoom(channel) ? presenceTtlMs() : REPLAY_TTL_SECONDS * 1000;
}

export async function publishToChannel(channel: string, data: string) {
  await useRedis("pubsub").eval(
    PUBLISH_SCRIPT,
    1,
    replayKey(channel),
    REPLAY_LENGTH,
    data,
    channelTopic(channel),
    replayTtlMs(channel),
  );
}

export function parsePublished(published: string): ChannelEvent {
  const separator = published.indexOf("\n");

  return {
    id: published.slice(0, separator),
    data: published.slice(separator + 1),
  };
}

export async function eventsAfter(channel: string, lastEventId: string) {
  // ioredis types an eval reply as unknown; the script above fixes its shape.
  const [entries, firstKept, trimmed] = (await useRedis("pubsub").eval(
    READ_AFTER_SCRIPT,
    1,
    replayKey(channel),
    lastEventId,
  )) as [StreamEntry[], string | null, number];
  const events: ChannelEvent[] = entries.map(([id, fields]) => ({ id, data: fields[1] ?? "" }));
  const cursorTime = Number(lastEventId.split("-")[0]);
  const expiredBy = (time: number) => lastEventId !== "0-0" && time - cursorTime >= REPLAY_TTL_SECONDS * 1000;

  return {
    events,
    missed:
      firstKept === null
        ? expiredBy(await redisNow(useRedis("pubsub")))
        : isAfter(firstKept, lastEventId) && (trimmed === 1 || expiredBy(Number(firstKept.split("-")[0]))),
  };
}

export async function latestEventId(channel: string) {
  const [latest] = await useRedis("pubsub").xrevrange(replayKey(channel), "+", "-", "COUNT", 1);

  return latest?.[0] ?? `${await redisNow(useRedis("pubsub"))}-0`;
}

export function bufferedEvents(channel: string) {
  return useRedis("pubsub").xlen(replayKey(channel));
}
