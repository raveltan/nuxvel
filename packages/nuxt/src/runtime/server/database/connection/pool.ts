import { drizzle } from "drizzle-orm/postgres-js";
import type { PgTransactionConfig } from "drizzle-orm/pg-core";
import { useRuntimeConfig } from "nitropack/runtime";
import postgres, { type Sql } from "postgres";
import * as schema from "#nuxvel/schema";
import type { NuxvelDb, NuxvelTx } from "../client";
import { queryCountLogger } from "../query-counter";
import { hideQueryParams } from "./hide-query-params";
import { markQueryCallSite } from "./query-call-site";
import { runTransaction } from "./run-transaction";

let pool: NuxvelDb | undefined;
let wrapClient: ((client: Sql) => Sql) | undefined;

hideQueryParams();

function connect(): NuxvelDb {
  const { databaseUrl: url, databasePoolMax } = useRuntimeConfig();

  if (!url) throw new Error("NUXT_DATABASE_URL is not set: useDb() has no database to connect to");

  const client = postgres(url, {
    max: databasePoolMax,
    connect_timeout: 5,
    connection: { statement_timeout: 15_000, idle_in_transaction_session_timeout: 30_000 },
  });

  return drizzle(wrapClient?.(client) ?? client, { schema, logger: queryCountLogger });
}

export function wrapPoolClient(wrap: (client: Sql) => Sql) {
  wrapClient = wrap;
}

export function rootPool(): NuxvelDb {
  pool ??= connect();

  return pool;
}

export async function closePool() {
  const closing = pool;

  pool = undefined;
  await closing?.$client.end();
}

export function wrapDb<T extends NuxvelDb | NuxvelTx>(db: T): T {
  return new Proxy(db, {
    get(target, prop) {
      markQueryCallSite();

      if (prop === "transaction")
        return <R>(fn: (tx: NuxvelTx) => Promise<R>, config?: PgTransactionConfig) =>
          runTransaction(db, fn, config);

      return Reflect.get(target, prop);
    },
  });
}
