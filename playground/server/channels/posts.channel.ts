import { z } from "zod";
import { defineChannel } from "@nuxvel/nuxt/server/realtime";

export const postsChannel = defineChannel({
  events: {
    created: z.object({
      id: z.number(),
      title: z.string(),
      body: z.string(),
      authorId: z.string(),
      createdAt: z.date(),
      updatedAt: z.date(),
    }),
  },
  presence: { state: z.object({ typing: z.boolean() }) },
});
