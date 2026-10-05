import { defineNitroPlugin } from "nitropack/runtime";
import { closePool } from "../database/connection/pool";
import { closeQueue } from "../jobs/queue";
import { useLogger } from "../logging/logger";
import { closeMailTransport } from "../mail/transport";
import { closeSubscriber } from "../realtime/streams/channel-subscriber";
import { closeKeptAliveStreams } from "../realtime/streams/keep-alive";
import { closeRedis } from "../redis/client";
import { closeS3 } from "../storage/client";

export default defineNitroPlugin((nitro) => {
  process.once("SIGTERM", () => void closeKeptAliveStreams());
  process.once("SIGINT", () => void closeKeptAliveStreams());
  nitro.hooks.hook("close", async () => {
    useLogger("server").debug("closing every connection");
    await closeKeptAliveStreams();
    await closeSubscriber();
    await closeQueue();
    await closeRedis();
    closeMailTransport();
    closeS3();
    await closePool();
  });
});
