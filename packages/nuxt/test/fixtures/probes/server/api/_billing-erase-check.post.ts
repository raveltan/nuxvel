import { z } from "zod";

const body = z.object({ userId: z.string() });

export default defineEventHandler(async (event) => {
  const { userId } = body.parse(await readBody(event));

  try {
    return { erased: await eraseUserData(userId) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
});
