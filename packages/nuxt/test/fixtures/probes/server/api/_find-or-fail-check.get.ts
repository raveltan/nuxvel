import { randomUUID } from "node:crypto";
import { userTable } from "~~/server/database/schema/auth.schema";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";

export default defineEventHandler(async () => {
  const inserted = await useDb()
    .insert(healthChecksTable)
    .values({})
    .returning()
    .then(firstOrFail);

  const found = await findOrFail(healthChecksTable, inserted.id);

  const userId = randomUUID();
  await useDb()
    .insert(userTable)
    .values({ id: userId, name: "Text id", email: `${userId}@example.com` });
  const foundUser = await findOrFail(userTable, userId);

  let threwNotFound = false;
  let isTaxonomyNotFound = false;
  try {
    await findOrFail(healthChecksTable, -1);
  } catch (e) {
    threwNotFound = e instanceof NotFoundError;
    isTaxonomyNotFound = isTaxonomyError(e, "NOT_FOUND");
  }

  let firstOfNothingNotFound = false;
  try {
    firstOrFail([]);
  } catch (e) {
    firstOfNothingNotFound = e instanceof NotFoundError;
  }

  return {
    matches: found.id === inserted.id,
    matchesTextId: foundUser.id === userId,
    threwNotFound,
    isTaxonomyNotFound,
    firstOfNothingNotFound,
  };
});
