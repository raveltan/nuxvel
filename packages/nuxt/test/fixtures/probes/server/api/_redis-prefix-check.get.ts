import { useQueue } from "@nuxvel/nuxt/server/queues";
import { useRedis } from "@nuxvel/nuxt/server/redis";
import { goDown, goUp } from "../../../../../src/runtime/server/maintenance/state";
import { channelTopic, revokedSessionsTopic } from "../../../../../src/runtime/server/realtime/streams/channel-topic";
import { remember, withLock } from "@nuxvel/nuxt/server/cache";
import { rateLimiter } from "@nuxvel/nuxt/server/security";

export default defineEventHandler(async () => {
  await remember("probe:prefixed", { minutes: 1 }, () => "value");
  await withLock("probe:prefixed", { minutes: 1 }, () => undefined);
  await rateLimiter("_probe").consume("prefixed");
  await useQueue().add("_probe", {});
  await goDown({});
  await goUp();

  return {
    keys: await useRedis("cache").keys("*"),
    topics: [channelTopic("posts"), revokedSessionsTopic()],
  };
});
