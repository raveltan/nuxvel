import { and, eq } from "drizzle-orm";
import { defineEventHandler, readValidatedBody } from "h3";
import { z } from "zod";
import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";
import { requireAuth } from "../utils/auth";

const bodySchema = z.object({ endpoint: z.string() });

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth();
  const { endpoint } = await readValidatedBody(event, bodySchema.parse);

  const pushSubscriptions = schemaTable("push_subscriptions");

  await useDb()
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)));

  return { unsubscribed: true };
});
