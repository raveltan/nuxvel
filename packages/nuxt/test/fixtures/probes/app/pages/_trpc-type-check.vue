<script setup lang="ts">
import { z } from "zod";

type IsAny<T> = 0 extends 1 & T ? true : false;

function typed<T>(value: IsAny<T> extends true ? never : T) {
  return value;
}

const { $trpc: trpc } = useNuxtApp();

const clientIsTyped: IsAny<typeof trpc> extends true ? never : true = true;
const pingReturnsString: Awaited<
  ReturnType<typeof trpc.health.ping.query>
> extends string
  ? true
  : never = true;

type CreatedKey = Awaited<ReturnType<typeof trpc.apiKeys.create.mutate>>;
const createdKeyIsTyped: IsAny<CreatedKey> extends true
  ? never
  : CreatedKey extends { key: string; id: string }
    ? true
    : never = true;

type ActionProcedureOutput = Awaited<ReturnType<typeof trpc._procedureMethodsCheck.update.mutate>>;
type ActionProcedureInput = Parameters<typeof trpc._procedureMethodsCheck.update.mutate>[0];
type ActionProcedureSetOutput = Awaited<ReturnType<typeof trpc._procedureMethodsCheck.rename.mutate>>;
const actionProcedureOutputIsTyped: IsAny<ActionProcedureOutput> extends true
  ? never
  : ActionProcedureOutput extends { title: string; body: string }
    ? true
    : never = true;
const actionProcedureInputIsTyped: IsAny<ActionProcedureInput> extends true
  ? never
  : ActionProcedureInput extends { id: number; title: string }
    ? true
    : never = true;
const actionProcedureKeepsItsOutput: IsAny<ActionProcedureSetOutput> extends true
  ? never
  : keyof ActionProcedureSetOutput extends "id" | "title"
    ? true
    : never = true;

type MountedActionOutput = Awaited<ReturnType<typeof $api.healthChecks.updateHealthCheck.mutate>>;
type MountedActionInput = Parameters<typeof $api.healthChecks.updateHealthCheck.mutate>[0];
const mountedActionOutputIsTyped: IsAny<MountedActionOutput> extends true
  ? never
  : MountedActionOutput extends { id: number; name: string }
    ? true
    : never = true;
const mountedActionInputIsTyped: IsAny<MountedActionInput> extends true
  ? never
  : MountedActionInput extends { id: number; name: string }
    ? true
    : never = true;

type ActionOutputSchemaOutput = Awaited<ReturnType<typeof trpc._procedureMethodsCheck.secret.mutate>>;
const actionSendsItsOutputSchema: IsAny<ActionOutputSchemaOutput> extends true
  ? never
  : keyof ActionOutputSchemaOutput extends "id"
    ? true
    : never = true;
type MountedOutputSchemaOutput = Awaited<ReturnType<typeof $api._probes.secretRow.mutate>>;
const mountedActionSendsItsOutputSchema: IsAny<MountedOutputSchemaOutput> extends true
  ? never
  : keyof MountedOutputSchemaOutput extends "id"
    ? true
    : never = true;

const byIdOptions = trpc.post.byId.queryOptions({ id: 1 });
const queryOptionsAreTyped: IsAny<
  Awaited<ReturnType<typeof byIdOptions.query>>
> extends true
  ? never
  : Awaited<ReturnType<typeof byIdOptions.query>> extends { title: string }
    ? true
    : never = true;
const mutationOptionsAreTyped: Parameters<
  ReturnType<typeof trpc.health.echo.mutationOptions>["mutation"]
>[0] extends string
  ? true
  : never = true;

const { mutate: renamePost } = useMutation(
  trpc.post.update.mutationOptions({
    optimistic: {
      key: (input) => trpc.post.byId.key({ id: input.id }),
      apply: (post, input) => ({ ...post, title: input.title }),
    },
  }),
);
const optimisticIsTyped: Parameters<typeof renamePost>[0] extends {
  id: number;
  title: string;
}
  ? true
  : never = true;

const createPostForm = useActionForm(
  createPostInput,
  trpc.post.create.mutationOptions(),
  {
    defaults: { title: "", body: "" },
    onSuccess: (post) => typed(post).title,
  },
);

useActionForm(createPostInput, trpc.post.create.mutationOptions(), {
  defaults: { title: "", body: "" },
  failures: {
    "post.body-empty": "body",
    // @ts-expect-error
    "post.title-taken": "headline",
  },
});

useActionForm(createPostInput, trpc.post.create.mutationOptions(), {
  defaults: { title: "", body: "" },
  failures: {
    // @ts-expect-error no action declares post.nope
    "post.nope": "body",
  },
});


trpc.post.create.useMutation({ toast: (post) => typed(post).title });
trpc.post.create.mutationOptions({ toast: (post) => ({ title: typed(post).title, icon: "i-lucide-check" }) });

trpc.post.delete.useMutation({ confirm: (input) => ({ title: `Delete ${typed(input).id}?`, color: "error" }) });
// @ts-expect-error a confirm dialog needs a title
trpc.post.delete.mutationOptions({ confirm: {} });

const tagsSchema = z.object({ tags: z.string().transform((tags) => tags.split(",")) });
const tagsForm = useActionForm(
  tagsSchema,
  { mutation: async (input: { tags: string }) => input.tags.length },
  { defaults: { tags: "" }, onSuccess: (count) => typed(count).toFixed() },
);
const transformFormIsTyped: typeof tagsForm.state extends { tags: string }
  ? true
  : never = true;
const actionFormIsTyped: IsAny<typeof createPostForm.state> extends true
  ? never
  : typeof createPostForm.state extends { title: string; body: string }
    ? typeof createPostForm.errors extends Record<string, string[]>
      ? true
      : never
    : never = true;

const abilitiesOptions = trpc.post.abilities.queryOptions({ id: 1 });
const abilitiesAreTyped: IsAny<
  Awaited<ReturnType<typeof abilitiesOptions.query>>
> extends true
  ? never
  : Awaited<ReturnType<typeof abilitiesOptions.query>> extends {
        update: boolean;
        delete: boolean;
      }
    ? true
    : never = true;

const { mutate: deletePost } = useMutation(
  trpc.post.delete.mutationOptions({ optimistic: { key: () => trpc.post.list.key(), apply: removeRow() } }),
);
const deleteIsTyped: IsAny<Parameters<typeof deletePost>[0]> extends true
  ? never
  : Parameters<typeof deletePost>[0] extends { id: number }
    ? true
    : never = true;
const deleteReturnsId: Awaited<
  ReturnType<ReturnType<typeof trpc.post.delete.mutationOptions>["mutation"]>
> extends { id: number }
  ? true
  : never = true;

type UpdatePostInput = RouterInputs["post"]["update"];
type PostById = RouterOutputs["post"]["byId"];
const routerInputsAreTyped: IsAny<UpdatePostInput> extends true
  ? never
  : UpdatePostInput extends Parameters<
        ReturnType<typeof trpc.post.update.mutationOptions>["mutation"]
      >[0]
    ? true
    : never = true;
const routerOutputsAreTyped: IsAny<PostById> extends true
  ? never
  : PostById extends Awaited<ReturnType<typeof byIdOptions.query>>
    ? PostById extends { id: number; title: string; body: string }
      ? true
      : never
    : never = true;

const { signInWith } = useUser();
type SignInProvider = Parameters<typeof signInWith>[0];
const signInWithIsTyped: IsAny<SignInProvider> extends true
  ? never
  : string extends SignInProvider
    ? never
    : true = true;
function signInWithUnknownProvider() {
  // @ts-expect-error no provider named nope is turned on
  return signInWith("nope");
}

const { data: ping } = useQuery(trpc.health.ping.queryOptions());

const postList = useQuery(trpc.post.list.queryOptions());
const reactivePostList = reactive(useQuery(trpc.post.list.queryOptions()));
function titlesOf<T extends { title: string }[]>(
  posts: IsAny<T> extends true ? never : T,
) {
  return posts.map((post) => post.title).join(", ");
}
function titleOf<T extends { title: string }>(post: IsAny<T> extends true ? never : T) {
  return post.title;
}

const postListState = useQueryState(trpc.post.list.key());
type PostListErrorCode = NonNullable<NonNullable<typeof postListState.error.value>["data"]>["code"];
const networkErrorCodeIsTyped: IsAny<PostListErrorCode> extends true
  ? never
  : "NETWORK_ERROR" extends PostListErrorCode
    ? true
    : never = true;

type ListRow = RouterOutputs["post"]["list"]["rows"][number];
const listRowsAreTyped: IsAny<ListRow> extends true
  ? never
  : ListRow extends { id: number; title: string }
    ? true
    : never = true;
type PostFeed = RouterOutputs["post"]["feed"];
const feedIsTyped: IsAny<PostFeed> extends true
  ? never
  : PostFeed extends { rows: { id: number; title: string }[]; nextCursor: number | null }
    ? true
    : never = true;
</script>

<template>
  <div>
    {{ ping }} {{ clientIsTyped }} {{ pingReturnsString }} {{ createdKeyIsTyped }} {{ actionProcedureOutputIsTyped }} {{ actionProcedureInputIsTyped }} {{ actionProcedureKeepsItsOutput }} {{ mountedActionOutputIsTyped }} {{ mountedActionInputIsTyped }} {{ mountedActionSendsItsOutputSchema }} {{ actionSendsItsOutputSchema }}
    {{ queryOptionsAreTyped }} {{ mutationOptionsAreTyped }}
    {{ optimisticIsTyped }} {{ actionFormIsTyped }} {{ transformFormIsTyped }}
    {{ abilitiesAreTyped }} {{ deleteIsTyped }} {{ deleteReturnsId }}
    {{ routerInputsAreTyped }} {{ routerOutputsAreTyped }} {{ signInWithIsTyped }} {{ listRowsAreTyped }} {{ feedIsTyped }} {{ networkErrorCodeIsTyped }}    <QueryState :query="postList">
      <template #default="{ data }">{{ titlesOf(data.rows) }}</template>
    </QueryState>
    <DataTable :query="postList" :columns="[{ accessorKey: 'title', header: 'Title' }]">
      <template #title-cell="{ row }">{{ titleOf(row.original) }}</template>
    </DataTable>
    <QueryState :query="reactivePostList">
      <template #default="{ data }">{{ titlesOf(data.rows) }}</template>
    </QueryState>
    <DataTable :query="reactivePostList" :columns="[{ accessorKey: 'title', header: 'Title' }]">
      <template #title-cell="{ row }">{{ titleOf(row.original) }}</template>
    </DataTable>
  </div>
</template>
