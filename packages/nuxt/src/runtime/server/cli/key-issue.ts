import { eq } from "drizzle-orm";
import { issueApiKey } from "../auth/api-keys";
import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";
import { CommandError, commandSuccess } from "./command-error";

export async function runKeyIssue(userId: string, name: string): Promise<number> {
  const user = schemaTable("user");
  const [owner] = await useDb().select({ id: user.id }).from(user).where(eq(user.id, userId));

  if (!owner) throw new CommandError(`no user has the id "${userId}"`);

  const { key } = await issueApiKey(userId, { name });

  console.log(key);
  commandSuccess(`Issued the API key "${name}" for user ${userId}. Store it now: it is not shown again`);

  return 0;
}
