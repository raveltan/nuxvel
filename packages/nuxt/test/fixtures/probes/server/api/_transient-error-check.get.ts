import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { userTable } from "~~/server/database/schema/auth.schema";
import { defineAction, systemActor } from "@nuxvel/nuxt/server/actions";
import { isTaxonomyError } from "@nuxvel/nuxt/server/api";
import { useDb } from "@nuxvel/nuxt/server/database";

function signal() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

const lockSignals = new Map<string, { mine: ReturnType<typeof signal>; theirs: ReturnType<typeof signal> }>();

const renameBoth = probeNamed("_transient-error-check.renameBoth", defineAction({
  input: z.object({ first: z.string(), second: z.string(), name: z.string() }),
  handler: async ({ first, second, name }) => {
    const locked = lockSignals.get(first);

    if (!locked) throw new Error("no lock signals for this call");

    await useDb().update(userTable).set({ name }).where(eq(userTable.id, first));
    locked.mine.resolve();
    await locked.theirs.promise;
    await useDb().update(userTable).set({ name }).where(eq(userTable.id, second));
  },
}));

export default defineEventHandler(async () => {
  const actor = systemActor("_transient-error-check");
  const a = randomUUID();
  const b = randomUUID();

  await useDb().insert(userTable).values([
    { id: a, name: "A", email: `${a}@example.com` },
    { id: b, name: "B", email: `${b}@example.com` },
  ]);

  const aLocked = signal();
  const bLocked = signal();

  lockSignals.set(a, { mine: aLocked, theirs: bLocked });
  lockSignals.set(b, { mine: bLocked, theirs: aLocked });

  const settled = await Promise.allSettled([
    renameBoth({ first: a, second: b, name: "from a" }, { actor }),
    renameBoth({ first: b, second: a, name: "from b" }, { actor }),
  ]);

  return settled.map((result) => {
    if (result.status === "fulfilled") return "committed";

    return isTaxonomyError(result.reason, "SERVICE_UNAVAILABLE") ? result.reason.code : "not transient";
  });
});
