import type { TRPCClient } from "@trpc/client";
import type { AppRouter } from "../../server/trpc/router";
import type { TRPCOptionsProxy } from "./options-proxy";

/**
 * The app's tRPC client, as `$api` and `$trpc` give it: every procedure
 * of {@link AppRouter}, plus the Pinia Colada helpers of
 * {@link TRPCOptionsProxy}.
 */
export type AppTRPC = TRPCClient<AppRouter> & TRPCOptionsProxy<AppRouter>;
