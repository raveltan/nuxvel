import { defineEventHandler, readValidatedBody } from "h3";
import { z } from "zod";
import { MAX_CHANNEL_NAME_LENGTH } from "../../shared/realtime/channel-request";
import { ForbiddenError } from "../errors/forbidden-error";
import { ConflictError, NotFoundError } from "../errors/taxonomy";
import { presenceRoomParams } from "../../shared/realtime/presence-room";
import { findChannel } from "../realtime/registry";
import { ipKey } from "../security/rate-limit-key";
import { CHANNEL_JOIN_RATE_LIMIT } from "../security/rate-limit-registry";
import { rateLimiter } from "../security/rate-limit";
import { replayableEventId } from "../realtime/streams/catch-up";
import { sendConnectionCommand } from "../realtime/streams/connection-commands";
import { latestEventId } from "../realtime/streams/replay-buffer";
import { auth } from "../utils/auth";

const bodySchema = z.object({
  connectionId: z.string(),
  channel: z.string().max(MAX_CHANNEL_NAME_LENGTH),
  lastEventId: z.string().optional(),
});

export default defineEventHandler(async (event) => {
  const { connectionId, channel: name, lastEventId } = await readValidatedBody(event, bodySchema.parse);
  const channel = findChannel(name);

  if (!channel) throw new NotFoundError(`No channel is named "${name}"`);

  const session = await auth();

  await rateLimiter(CHANNEL_JOIN_RATE_LIMIT).consume(session ? `user:${session.user.id}` : ipKey(event));

  if (!(await channel.authorize({ user: session?.user ?? null, params: presenceRoomParams(name) }))) {
    throw new ForbiddenError(`Not allowed to listen to channel "${name}"`);
  }

  const delivered = await sendConnectionCommand(connectionId, {
    type: "join",
    channel: name,
    lastEventId: replayableEventId(lastEventId) ?? (await latestEventId(name)),
  });

  if (!delivered) throw new ConflictError("No server holds that connection");

  return { joined: true };
});
