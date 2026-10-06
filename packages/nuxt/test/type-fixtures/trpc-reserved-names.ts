import { initTRPC } from "@trpc/server";
import { createTrpcOptionsProxy } from "../../src/runtime/app/trpc/options-proxy";

const t = initTRPC.create();
const client = {};

const allowed = t.router({ post: t.router({ list: t.procedure.query(() => []) }) });

createTrpcOptionsProxy<typeof allowed, typeof client>(client);

const reservedProcedure = t.router({ post: t.router({ key: t.procedure.query(() => []) }) });

// @ts-expect-error post.key shadows the namespace's key()
createTrpcOptionsProxy<typeof reservedProcedure, typeof client>(client);

const reservedRouter = t.router({ queryOptions: t.router({ list: t.procedure.query(() => []) }) });

// @ts-expect-error a queryOptions namespace shadows the factory
createTrpcOptionsProxy<typeof reservedRouter, typeof client>(client);

const reservedMutation = t.router({ post: t.router({ mutationOptions: t.procedure.mutation(() => 1) }) });

// @ts-expect-error post.mutationOptions shadows the factory
createTrpcOptionsProxy<typeof reservedMutation, typeof client>(client);

const reservedThen = t.router({ then: t.procedure.query(() => 1) });

// @ts-expect-error a then procedure would make the client a thenable
createTrpcOptionsProxy<typeof reservedThen, typeof client>(client);

const reservedUseQuery = t.router({ post: t.router({ useQuery: t.procedure.query(() => []) }) });

// @ts-expect-error post.useQuery shadows the composable
createTrpcOptionsProxy<typeof reservedUseQuery, typeof client>(client);

const reservedUseMutation = t.router({ post: t.router({ useMutation: t.procedure.mutation(() => 1) }) });

// @ts-expect-error post.useMutation shadows the composable
createTrpcOptionsProxy<typeof reservedUseMutation, typeof client>(client);
