import { eq } from "drizzle-orm";
import { z } from "zod";
import { userTable } from "#nuxvel/schema";

export const changeUserId = defineAction({
  input: z.object({ id: z.string(), newId: z.string() }),
  handler: async ({ id, newId }) => {
    await useDb().update(userTable).set({ id: newId }).where(eq(userTable.id, id));
  },
});
