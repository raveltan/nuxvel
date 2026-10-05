import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

let client: { url: string; db: ReturnType<typeof drizzle> } | undefined;

export function testDatabase() {
  const url = process.env.NUXT_DATABASE_URL;

  if (!url) {
    throw new Error("nuxvel testing: NUXT_DATABASE_URL is not set for the test process");
  }

  if (client?.url !== url) {
    client = { url, db: drizzle(postgres(url, { max: 1, idle_timeout: 1, onnotice: () => {} })) };
  }

  return client.db;
}
