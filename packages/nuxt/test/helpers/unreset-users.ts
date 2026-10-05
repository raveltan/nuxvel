import { defineFactory, sequence } from "@nuxvel/nuxt/factories";
import { pgTable, text } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { vi } from "vitest";
import { TEST_ADMIN_DATABASE_URL } from "@nuxvel/test-helpers/services";

const unresetUsers = pgTable("_nuxvel_unreset_users", {
  email: text("email").notNull().unique(),
});

export const unresetUserFactory = defineFactory(unresetUsers, {
  email: sequence((n) => `user-${n}@example.com`),
});

export async function useUnresetUsersTable() {
  const sql = postgres(TEST_ADMIN_DATABASE_URL, { max: 1, onnotice: () => {} });

  try {
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('_nuxvel_unreset_users'))`;
      await tx`create table if not exists _nuxvel_unreset_users (email text not null unique)`;
    });
  } finally {
    await sql.end();
  }

  vi.stubEnv("NUXT_DATABASE_URL", TEST_ADMIN_DATABASE_URL);

  return () => vi.unstubAllEnvs();
}
