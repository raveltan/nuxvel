import { z } from "zod";
import { useRedis } from "../../redis/client";
import { connectionTopic } from "./channel-topic";

const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), channel: z.string(), lastEventId: z.string() }),
  z.object({ type: z.literal("leave"), channel: z.string() }),
]);

export type ConnectionCommand = z.infer<typeof commandSchema>;

export async function sendConnectionCommand(connectionId: string, command: ConnectionCommand) {
  const receivers = await useRedis("pubsub").publish(
    connectionTopic(connectionId),
    JSON.stringify(command),
  );

  return receivers > 0;
}

export function parseConnectionCommand(data: string) {
  try {
    const parsed = commandSchema.safeParse(JSON.parse(data));

    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
