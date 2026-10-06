import { z } from "zod";

export default defineChannel({
  events: {
    renamed: z.object({ id: z.number() }),
    "from-job": z.object({ title: z.string() }),
    checked: z.object({
      title: z.string().refine(async (title) => title !== "rejected", { message: "That title is rejected" }),
    }),
  },
  public: true,
});
