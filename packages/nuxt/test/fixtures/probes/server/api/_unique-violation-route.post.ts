import { randomUUID } from "node:crypto";
import { userTable } from "~~/server/database/schema/auth.schema";

export default defineEventHandler(async () => {
  const email = `${randomUUID()}@example.com`;

  await useDb().insert(userTable).values({ id: randomUUID(), name: "First", email });
  await useDb().insert(userTable).values({ id: randomUUID(), name: "Second", email });
});
