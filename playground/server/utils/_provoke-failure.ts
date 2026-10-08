import { sql } from "drizzle-orm";
import { z } from "zod";
import { useDb } from "@nuxvel/nuxt/server/database";

export const failureKindSchema = z.object({ kind: z.enum(["plain", "postgres", "transient", "upstream", "zod"]) });

export async function provokeFailure(kind: z.infer<typeof failureKindSchema>["kind"]): Promise<never> {
  if (kind === "postgres") await useDb().execute(sql`select * from leak_probe_secret_table where id = ${"leak_bound_param"}`);

  if (kind === "transient") {
    await useDb().transaction(async (tx) => {
      await tx.execute(sql.raw("set local statement_timeout = 1"));
      await tx.execute(sql.raw("select pg_sleep(1), 'leak_probe_secret'"));
    });
  }

  if (kind === "upstream") await $fetch("/api/_leak_probe_secret_upstream");

  if (kind === "zod") z.object({ leak_probe_secret: z.string() }).parse({});

  throw new Error("leak_probe_secret in a plain error");
}
