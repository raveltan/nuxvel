import { z } from "zod";

export default defineChannel({
  events: { moved: z.object({ card: z.number() }) },
  params: ["boardId"],
  authorize: ({ user, params }) => user !== null && params.boardId !== "3",
});
