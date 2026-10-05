import { z } from "zod";
import { publishChannelMessage } from "../../../../../src/runtime/server/realtime/streams/publish-message";

const bodySchema = z.object({
  channel: z.string(),
  event: z.string(),
  payload: z.unknown(),
});

export default defineEventHandler(async (event) => {
  const { channel, event: name, payload } = bodySchema.parse(
    await readBody(event),
  );

  await publishChannelMessage(channel, name, payload);

  return { broadcast: true };
});
