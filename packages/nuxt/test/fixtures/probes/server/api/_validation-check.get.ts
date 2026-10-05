import { z } from "zod";

const schema = z.object({
  name: z.string().min(3),
  age: z.number().min(18),
});

export default defineEventHandler(() => {
  const result = schema.safeParse({ name: "a", age: 5 });

  if (result.success) return { fields: {} };

  return toValidationError(result.error);
});
