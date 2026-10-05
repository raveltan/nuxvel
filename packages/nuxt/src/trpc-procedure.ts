import type { AnyTRPCProcedure, inferProcedureInput, inferProcedureOutput, TRPCRouterRecord } from "@trpc/server";
import type { AppRouter } from "./runtime/server/trpc/router";

type ProcedureMocks<TRecord extends TRPCRouterRecord> = {
  [K in keyof TRecord]?: TRecord[K] extends AnyTRPCProcedure
    ? (input: inferProcedureInput<TRecord[K]>) => inferProcedureOutput<TRecord[K]> | Promise<inferProcedureOutput<TRecord[K]>>
    : TRecord[K] extends TRPCRouterRecord
      ? ProcedureMocks<TRecord[K]>
      : never;
};

type AnyProcedure = (input: never) => unknown;

type Paths<T, Prefix extends string = ""> = {
  [K in keyof T & string]-?: NonNullable<T[K]> extends AnyProcedure ? `${Prefix}${K}` : Paths<NonNullable<T[K]>, `${Prefix}${K}.`>;
}[keyof T & string];

type At<T, P extends string> = P extends `${infer Head}.${infer Rest}` ? At<NonNullable<T[Head & keyof T]>, Rest> : NonNullable<T[P & keyof T]>;

/**
 * The procedures `mockTrpc` of `@nuxvel/nuxt/storybook/mocks` answers,
 * nested like the app router:
 * each one is a function from the procedure's input to its output.
 */
export type TrpcMocks = ProcedureMocks<AppRouter["_def"]["record"]>;

/**
 * The dotted path of a procedure of the app router, such as
 * `"post.update"`. A path that names no procedure does not compile.
 * See {@link TrpcProcedure}.
 */
export type TrpcPath = Paths<TrpcMocks>;

/**
 * The function type of the procedure at `P`: from its input to its
 * output, or to a promise of its output. Give it to `fn()` of
 * `storybook/test` to type a spy by the router. See {@link TrpcPath}.
 */
export type TrpcProcedure<P extends TrpcPath> = Extract<At<TrpcMocks, P>, AnyProcedure>;
