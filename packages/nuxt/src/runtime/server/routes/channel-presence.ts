import { defineEventHandler, readValidatedBody } from "h3";
import { z } from "zod";
import { MAX_CHANNEL_NAME_LENGTH } from "../../shared/realtime/channel-request";
import { NotFoundError } from "../errors/taxonomy";
import { updatePresenceState } from "../realtime/presence";
import { findChannel } from "../realtime/registry";
import { rateLimit } from "../security/point-of-use";
import { requireAuth } from "../utils/auth";

const bodySchema = z.object({
  connectionId: z.string(),
  channel: z.string().max(MAX_CHANNEL_NAME_LENGTH),
  state: z.record(z.string(), z.unknown()),
});

export default defineEventHandler({
  onRequest: [rateLimit({ points: 120, window: { minutes: 1 }, by: "user" })],
  handler: async (event) => {
    const { connectionId, channel: room, state } = await readValidatedBody(event, bodySchema.parse);
    const presence = findChannel(room)?.presence;

    if (!presence) throw new NotFoundError(`No presence room is named "${room}"`);

    const session = await requireAuth();

    await updatePresenceState(room, presence, { connectionId, userId: session.user.id, state });

    return { updated: true };
  },
});
