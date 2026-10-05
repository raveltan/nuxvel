import { useLogger } from "../../logging/logger";
import { useRedis } from "../../redis/client";
import { revokedSessionsTopic } from "./channel-topic";

export async function closeSessionStreams(sessionId: string) {
  try {
    await useRedis("pubsub").publish(revokedSessionsTopic(), sessionId);
  } catch (error) {
    useLogger("realtime").warn("Could not close the realtime streams of a deleted session", error);
  }
}
