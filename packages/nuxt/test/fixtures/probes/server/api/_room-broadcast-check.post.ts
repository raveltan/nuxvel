import { z } from "zod";
import _probeBoardChannel from "#server/channels/_probe-board";
import { transaction } from "@nuxvel/nuxt/server/database";

const bodySchema = z.object({
  card: z.number(),
  boardId: z.number().optional(),
  afterCommit: z.boolean().optional(),
});

export default defineEventHandler(async (event) => {
  const { card, boardId, afterCommit } = bodySchema.parse(await readBody(event));
  const params = boardId === undefined ? undefined : { boardId };

  if (afterCommit) {
    await transaction(() => _probeBoardChannel.broadcast("moved", { card }, params));
  } else {
    await _probeBoardChannel.broadcast("moved", { card }, params);
  }

  return { broadcast: true };
});
