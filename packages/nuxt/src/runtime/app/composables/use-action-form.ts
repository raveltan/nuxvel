import { z } from "zod";
import type actions from "#nuxvel/actions";
import procedureInputs from "#nuxvel/procedure-inputs";
import { bindActionForm } from "../forms/action-form";
import { PROCEDURE_PATH } from "../trpc/options-proxy";

type ActionFailureCode = (typeof actions)[number] extends infer Discovered
  ? Discovered extends { errors: infer Errors } ? keyof Errors & string : never
  : never;

type ProcedureInputs = typeof procedureInputs;

/** A mutation procedure of `$api`, such as `$api.post.create`, as {@link useActionForm} takes it. */
export interface FormProcedure {
  readonly [PROCEDURE_PATH]: string;
  mutationOptions: (...args: never[]) => { mutation: (input: never) => Promise<unknown> };
}

type Mutation<P extends FormProcedure> = ReturnType<P["mutationOptions"]>["mutation"];

type ProcedureInput<P extends FormProcedure> = Parameters<Mutation<P>>[0];

type ProcedureOutput<P extends FormProcedure> = Awaited<ReturnType<Mutation<P>>>;

type SharedSchemaOf<P extends FormProcedure> = P[typeof PROCEDURE_PATH] extends keyof ProcedureInputs
  ? ProcedureInputs[P[typeof PROCEDURE_PATH]]
  : never;

type SchemaCheck<P extends FormProcedure, Schema extends z.ZodType> = [Schema] extends [never]
  ? `$api.${P[typeof PROCEDURE_PATH]} has no input schema in shared/schemas/: move its schema there, or pass useActionForm($api.${P[typeof PROCEDURE_PATH]}, { schema })`
  : [z.input<Schema>] extends [ProcedureInput<P>]
    ? unknown
    : `the input of schema is not the input of $api.${P[typeof PROCEDURE_PATH]}`;

/**
 * Options for {@link useActionForm}: its own keys, and every option of
 * `$api.<path>.mutationOptions()` but `onSuccess`, such as `toast`,
 * `confirm` and `invalidate`, which pass through to the mutation.
 */
export type ActionFormOptions<Schema extends z.ZodType, P extends FormProcedure> = Omit<
  NonNullable<Parameters<P["mutationOptions"]>[0]>,
  "onSuccess"
> & {
  /**
   * The schema that checks the state in the browser, in place of the
   * procedure's input schema from `shared/schemas/`. Required for a
   * procedure whose input schema is not there.
   */
  schema?: Schema;
  /**
   * The initial state, also what `v-model` binds to. Only the keys of
   * the schema are kept, so a whole row such as `props.post` works. A key
   * it leaves out, or sets to `undefined`, starts with the schema's
   * `.default()`, or as `undefined`: the schema then rejects the form
   * until the user sets a value. Only an object schema takes `defaults`:
   * with any other schema, such as `z.string()`, the state starts as
   * `undefined`.
   */
  defaults?: Partial<z.input<Schema>>;
  /** Runs with the mutation's result after a successful submit. */
  onSuccess?: (result: ProcedureOutput<P>) => unknown;
  /**
   * Maps an action's typed failure code to the field its message belongs
   * under, e.g. `{ "post.body-empty": "body" }`, in place of the `field`
   * the action declares for it. A code with no field lands in
   * `formError`. The keys are the codes that actions under
   * `server/actions/` declare in `errors`, so an unknown code does not
   * compile.
   */
  failures?: Partial<Record<ActionFailureCode, Extract<keyof z.input<Schema>, string>>>;
  /**
   * Asks before the user leaves the page, by a link or by closing the tab,
   * while the state differs from the initial state or from the last
   * successful submit. Defaults to `true` for an edit form, one whose
   * `defaults` hold an `id`, and to `false` otherwise.
   */
  warnUnsaved?: boolean;
};

/** What {@link useActionForm} returns. */
export type ActionForm<Schema extends z.ZodType> = ReturnType<typeof bindActionForm<Schema, unknown>>;

function hasId(defaults: unknown) {
  return typeof defaults === "object" && defaults !== null && "id" in defaults;
}

function isObjectSchema(schema: z.ZodType): schema is z.ZodObject {
  return schema.def.type === "object";
}

function initialState(schema: z.ZodType, defaults: object) {
  if (!isObjectSchema(schema)) return undefined;

  return Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => {
      const value: unknown = Reflect.get(defaults, key);
      return [key, value !== undefined ? value : field._zod.def.type === "default" ? z.parse(field, undefined) : undefined];
    }),
  );
}

/**
 * Binds a mutation of `$api` to form state, checked by the procedure's
 * input schema, for a Nuxt UI `<UForm>` or a plain `<form>`.
 *
 * Auto-imported. Call it inside `setup()`. The schema is the one the
 * procedure takes from `shared/schemas/`, by `.input()`, by `.action()`
 * or by the action's `procedure`. A procedure whose schema is not there
 * does not compile unless you pass `schema`. With `<UForm>`, bind `ref`,
 * `schema`, `state` and `submit`: UForm validates with the schema before
 * anything is sent, and field errors the server returns (input
 * validation, a conflict on a single unique column, an action failure
 * with a `field`) land under the matching `<UFormField>` through its
 * `setErrors` and stay there until that field's value changes. So does
 * an action's typed failure whose code `failures` maps to a field. A
 * server field message whose field is not a key of `state`, such as
 * `key` of `promoteUpload()` in a form with `imageKey`, lands in
 * `formError` and not under a field. After a failed submit the first
 * invalid field is focused. Any other failure lands in `formError` and
 * is announced through `useAnnouncer()`, so render `<NuxtAnnouncer>` in
 * `app.vue`. Without Nuxt UI, `submit()` validates `state` itself and
 * fills `errors` per field (the {@link ValidationError} shape) from both
 * the schema and the server. A submit while the mutation runs does
 * nothing. Every submit sends one idempotency key, so a procedure with
 * `idempotent()` answers a repeat of the same state with the first
 * result instead of running again. A cancelled `confirm` sends nothing
 * and shows no error.
 *
 * The schema only checks the state in the browser: the mutation receives
 * the state as typed (`z.input`), unparsed, so a schema that coerces or
 * transforms is parsed once, by the procedure on the server.
 *
 * An edit form (one whose `defaults` hold an `id`) asks before the user
 * leaves with unsaved changes; see `warnUnsaved`.
 *
 * @param procedure - A mutation of `$api`, such as `$api.post.create`.
 * @param options - See {@link ActionFormOptions}.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const form = useActionForm($api.post.create, {
 *   toast: "Post created",
 *   onSuccess: (post) => navigateTo(`/posts/${post.id}`),
 * });
 * </script>
 *
 * <template>
 *   <UForm :ref="form.ref" :schema="form.schema" :state="form.state" @submit="form.submit">
 *     <UFormField name="title" label="Title"><UInput v-model="form.state.title" /></UFormField>
 *     <UAlert v-if="form.formError" color="error" :title="form.formError" />
 *     <UButton type="submit" :loading="form.pending">Create post</UButton>
 *   </UForm>
 * </template>
 * ```
 */
export function useActionForm<P extends FormProcedure, Schema extends z.ZodType = SharedSchemaOf<P> & z.ZodType>(
  procedure: P & NoInfer<SchemaCheck<P, Schema>>,
  options?: ActionFormOptions<Schema, P>,
): ActionForm<Schema>;
export function useActionForm(
  procedure: { readonly [PROCEDURE_PATH]: string; mutationOptions(options: object): { mutation: (input: unknown) => Promise<unknown> } },
  {
    schema,
    defaults = {},
    onSuccess,
    failures,
    warnUnsaved,
    ...mutationOptions
  }: { schema?: z.ZodType; defaults?: object; onSuccess?: (result: unknown) => unknown; failures?: Partial<Record<string, string>>; warnUnsaved?: boolean } = {},
) {
  const path = procedure[PROCEDURE_PATH];
  const registered: Partial<Record<string, z.ZodType>> = procedureInputs;
  const formSchema = schema ?? registered[path];

  if (!formSchema) throw new Error(`useActionForm: $api.${path} has no input schema in shared/schemas/; pass { schema }`);

  return bindActionForm(formSchema, procedure.mutationOptions(mutationOptions), {
    defaults: initialState(formSchema, defaults),
    onSuccess,
    failures,
    warnUnsaved: warnUnsaved ?? hasId(defaults),
  });
}
