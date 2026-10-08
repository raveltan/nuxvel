import { z } from "zod";
import { defineChannel } from "@nuxvel/nuxt/server/realtime";

export default defineChannel({
  events: { moved: z.object({ card: z.number() }) },
  params: ["boardId"],
  authorize: ({ user, params }) => user !== null && params.boardId !== "3",
});
