import { eq } from "drizzle-orm";
import { z } from "zod";
import { userTable } from "#nuxvel/schema";
import { defineAction } from "@nuxvel/nuxt/server/actions";
import { useDb } from "@nuxvel/nuxt/server/database";

export const changeUserId = defineAction({
  input: z.object({ id: z.string(), newId: z.string() }),
  handler: async ({ id, newId }) => {
    await useDb().update(userTable).set({ id: newId }).where(eq(userTable.id, id));
  },
});
