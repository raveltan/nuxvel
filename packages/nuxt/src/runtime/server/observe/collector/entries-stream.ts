import { setTimeout } from "node:timers/promises";
import { useRedis } from "../../redis/client";
import { redisKey } from "../../redis/key";
import { redisNow } from "../../redis/now";
import type { CollectedEntry } from "./collected-entry";

const ENTRIES_STREAM = "nuxvel:devtools:entries";
const MAX_STREAM_LENGTH = 100;
const BLOCK_MS = 5000;
const RETRY_MS = 1000;

export async function appendToStream(entry: CollectedEntry) {
  await useRedis("cache").xadd(
    redisKey(ENTRIES_STREAM),
    "MAXLEN",
    MAX_STREAM_LENGTH,
    "*",
    "entry",
    JSON.stringify(entry),
  );
}

function entriesIn(reply: [string, [string, string[]][]][] | null) {
  return (reply ?? []).flatMap(([, messages]) =>
    messages.map(([id, fields]) => ({ id, entry: fields[fields.indexOf("entry") + 1] })),
  );
}

export function tailStream(onEntry: (entry: CollectedEntry) => void) {
  const connection = useRedis("cache").duplicate();
  let lastId: string | undefined;
  let stopped = false;

  connection.on("error", () => {});

  const read = async () => {
    while (!stopped) {
      try {
        lastId ??= `${await redisNow(connection)}-0`;
        const reply = await connection.xread("BLOCK", BLOCK_MS, "STREAMS", redisKey(ENTRIES_STREAM), lastId);

        for (const { id, entry } of entriesIn(reply)) {
          lastId = id;
          if (entry !== undefined) onEntry(JSON.parse(entry));
        }
      } catch {
        if (!stopped) await setTimeout(RETRY_MS);
      }
    }
  };

  void read();

  return () => {
    stopped = true;
    connection.disconnect();
  };
}
