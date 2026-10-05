import { z } from "zod";

export const createPostInput = z.object({
  title: z.string().min(1),
  body: z.string(),
});

export const updatePostInput = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  body: z.string(),
});

export const postIdInput = z.object({
  id: z.number().int().positive(),
});

// Sent to the browser as the output of every procedure that uses it: list only columns every caller may see.
export const postSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  authorId: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.null().default(null),
});
