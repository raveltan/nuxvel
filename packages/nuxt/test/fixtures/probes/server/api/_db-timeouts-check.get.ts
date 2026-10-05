import { sql } from "drizzle-orm";

export default defineEventHandler(async () => {
  const [row] = await useDb().execute<{ statement: string; idleInTransaction: string }>(
    sql`select current_setting('statement_timeout') as statement, current_setting('idle_in_transaction_session_timeout') as "idleInTransaction"`,
  );

  return row;
});
