import { eq, type InferSelectModel } from "drizzle-orm";
import { useDb } from "../database/client";
import { type SchemaTable, schemaTable } from "../database/schema-table";

export async function sessionUser(id: string): Promise<InferSelectModel<SchemaTable<"user">>> {
  const users = schemaTable("user");
  const [user] = await useDb().select().from(users).where(eq(users.id, id));

  if (!user) throw new Error(`actingAs: no user has the id "${id}"`);

  return user;
}
