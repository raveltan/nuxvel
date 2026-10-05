import type { z } from "zod";

export function parseStoredJson<Schema extends z.ZodType>(
  schema: Schema,
  stored: string | null | undefined,
): z.output<Schema> | undefined {
  if (stored === null || stored === undefined) return undefined;

  try {
    const parsed = schema.safeParse(JSON.parse(stored));

    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
