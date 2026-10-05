import { randomUUID } from "node:crypto";
import { z } from "zod";
import { userTable } from "~~/server/database/schema/auth.schema";

const insertUser = probeNamed("_unique-violation-check.insertUser", defineAction({
  input: z.object({ email: z.string() }),
  handler: ({ email }) => useDb().insert(userTable).values({ id: randomUUID(), name: "Action", email }),
}));

async function conflictField(call: () => Promise<unknown>) {
  try {
    await call();
    return "no error";
  } catch (error) {
    return isTaxonomyError(error, "CONFLICT") ? (error.field ?? "no field") : "not a conflict";
  }
}

export default defineEventHandler(async () => {
  const email = `${randomUUID()}@example.com`;
  const actor = systemActor("_unique-violation-check");

  await useDb().insert(userTable).values({ id: randomUUID(), name: "First", email });

  const fromAction = await conflictField(() => insertUser({ email }, { actor }));
  const fromNestedTransaction = await conflictField(() =>
    transaction(() => insertUser({ email }, { actor })),
  );
  const fromProcedure = await conflictField(() =>
    useCaller()._uniqueViolationCheck.insertUser({ email }),
  );

  const inserted = useDb()
    .$with("inserted")
    .as(
      useDb()
        .insert(userTable)
        .values({ id: randomUUID(), name: "With", email: `${randomUUID()}@example.com` })
        .returning({ name: userTable.name }),
    );
  const insertedInWith = await useDb().with(inserted).select().from(inserted);

  return { fromAction, fromNestedTransaction, fromProcedure, insertedInWith };
});
