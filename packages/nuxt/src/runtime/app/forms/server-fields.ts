import { z } from "zod";
import type { ValidationError } from "../../shared/errors/validation";

const errorWithFields = z.object({
  data: z.object({ fields: z.record(z.string(), z.array(z.string())) }),
});

export function serverFields(error: unknown): ValidationError["fields"] | undefined {
  return errorWithFields.safeParse(error).data?.data.fields;
}
