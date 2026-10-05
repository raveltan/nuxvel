import { z } from "zod";

export const createTagInput = z.object({
  name: z.string().min(1),
});

// Sent to the browser as the output of every procedure that uses it: list only columns every caller may see.
export const tagSchema = z.object({
  id: z.number(),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
