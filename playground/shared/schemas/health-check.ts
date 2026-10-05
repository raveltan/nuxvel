import { z } from "zod";

export const healthCheckIdInput = z.object({
  id: z.number().int().positive(),
});

export const createHealthCheckInput = z.object({});

export const updateHealthCheckInput = z.object({
  id: healthCheckIdInput.shape.id,
  name: z.string().min(1),
});

// Sent to the browser as the output of every procedure that uses it: list only columns every caller may see.
export const healthCheckSchema = z.object({
  id: z.number(),
  userId: z.string().nullable(),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
