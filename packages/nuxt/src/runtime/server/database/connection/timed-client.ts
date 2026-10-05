import type { Sql, TransactionSql } from "postgres";
import { isObserved, publishObserved } from "../../observe/channels";
import { repeatedQueriesReason } from "../allow-repeated-queries";

type TransactionCallback = (sql: TransactionSql) => unknown;
type Settle<Value> = ((value: Value) => unknown) | null | undefined;

function timed<Query extends Promise<unknown>>(query: Query, sql: string, params: unknown[]): Query {
  if (!isObserved("db:query")) return query;

  const startedAt = performance.now();
  const repeatReason = repeatedQueriesReason();
  const then = query.then.bind(query);
  let published = false;

  const publish = () => {
    if (published) return;
    published = true;
    publishObserved("db:query", {
      sql,
      params,
      durationMs: performance.now() - startedAt,
      ...(repeatReason === undefined ? {} : { repeatReason }),
    });
  };

  // postgres.js runs a query on its first then(), so timing wraps then(), whose generics the cast restores
  query.then = ((onFulfilled: Settle<unknown>, onRejected: Settle<unknown>) =>
    then(
      (value) => {
        publish();
        return onFulfilled ? onFulfilled(value) : value;
      },
      (error) => {
        publish();
        if (onRejected) return onRejected(error);
        throw error;
      },
    )) as Query["then"];

  return query;
}

function timeStatements(sql: Sql | TransactionSql) {
  const unsafe = sql.unsafe;

  sql.unsafe = (query, params, options) => timed(unsafe(query, params, options), query, params ?? []);
}

function timedCallback(callback: TransactionCallback): TransactionCallback {
  return (sql) => callback(timedTransaction(sql));
}

function timedTransaction(sql: TransactionSql) {
  const savepoint = sql.savepoint;

  timeStatements(sql);
  // savepoint() is overloaded on an optional leading name, which one arrow can't be typed as
  sql.savepoint = ((nameOrCallback: string | TransactionCallback, callback?: TransactionCallback) =>
    typeof nameOrCallback === "string"
      ? savepoint(nameOrCallback, timedCallback(callback ?? (() => undefined)))
      : savepoint(timedCallback(nameOrCallback))) as typeof savepoint;

  return sql;
}

export function timedClient(client: Sql): Sql {
  const begin = client.begin;

  timeStatements(client);
  // begin() is overloaded on an optional leading options string, which one arrow can't be typed as
  client.begin = ((optionsOrCallback: string | TransactionCallback, callback?: TransactionCallback) =>
    typeof optionsOrCallback === "string"
      ? begin(optionsOrCallback, timedCallback(callback ?? (() => undefined)))
      : begin(timedCallback(optionsOrCallback))) as typeof begin;

  return client;
}
