import { z } from "zod";

const isoDate = z.date().transform((date) => date.toISOString());

export const postsChannel = defineChannel({
  events: {
    created: z.object({
      id: z.number(),
      title: z.string(),
      body: z.string(),
      authorId: z.string(),
      createdAt: isoDate,
      updatedAt: isoDate,
    }),
  },
  authorize: ({ user }) => user !== null,
  presence: { state: z.object({ typing: z.boolean() }) },
});
