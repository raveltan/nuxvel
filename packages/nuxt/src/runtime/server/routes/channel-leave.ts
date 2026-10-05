import { defineEventHandler, readValidatedBody } from "h3";
import { z } from "zod";
import { MAX_CHANNEL_NAME_LENGTH } from "../../shared/realtime/channel-request";
import { ConflictError } from "../errors/taxonomy";
import { sendConnectionCommand } from "../realtime/streams/connection-commands";

const bodySchema = z.object({
  connectionId: z.string(),
  channel: z.string().max(MAX_CHANNEL_NAME_LENGTH),
});

export default defineEventHandler(async (event) => {
  const { connectionId, channel } = await readValidatedBody(event, bodySchema.parse);
  const delivered = await sendConnectionCommand(connectionId, { type: "leave", channel });

  if (!delivered) throw new ConflictError("No server holds that connection");

  return { left: true };
});
