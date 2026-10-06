import {
  getCurrentInstance,
  markRaw,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  toRaw,
  watch,
  type ComponentPublicInstance,
} from "vue";
import { useMutation } from "@pinia/colada";
import { useAnnouncer } from "#app";
import { useI18n } from "#imports";
import { onBeforeRouteLeave } from "vue-router";
import { z } from "zod";
import type actions from "#nuxvel/actions";
import {
  toValidationError,
  type ValidationError,
} from "../../shared/errors/validation";
import { serverFields } from "../forms/server-fields";
import { MutationCancelledError } from "../trpc/options-proxy";

type ActionFailureCode = (typeof actions)[number] extends infer Discovered
  ? Discovered extends { errors: infer Errors } ? keyof Errors & string : never
  : never;

/** Options for {@link useActionForm}. */
export interface ActionFormOptions<Schema extends z.ZodType, TResult> {
  /**
   * Initial form state, also what `v-model` binds to. A field can start as
   * `undefined`, for example a required select. The schema then rejects
   * the form until the user sets a value.
   */
  defaults: { [Key in keyof z.input<Schema>]: z.input<Schema>[Key] | undefined };
  /** Runs with the mutation's result after a successful submit. */
  onSuccess?: (result: TResult) => unknown;
  /**
   * Maps an action's typed failure code to the field its message belongs
   * under, e.g. `{ "post.body-empty": "body" }`. A code not in the map lands
   * in `formError`. The keys are the codes that actions under
   * `server/actions/` declare in `errors`, so an unknown code does not
   * compile.
   */
  failures?: Partial<Record<ActionFailureCode, Extract<keyof z.input<Schema>, string>>>;
  /**
   * Asks before the user leaves the page, by a link or by closing the tab,
   * while the state differs from `defaults` or from the last successful
   * submit. Defaults to `true` for an edit form, one whose `defaults` hold
   * an `id`, and to `false` otherwise.
   */
  warnUnsaved?: boolean;
}

function hasId(defaults: unknown) {
  return typeof defaults === "object" && defaults !== null && "id" in defaults;
}

type Fields = ValidationError["fields"];

interface BoundForm {
  loading: boolean;
  errors: { id?: string }[];
  setErrors(errors: { name: string; message: string }[]): void;
}

function isBoundForm(value: unknown): value is BoundForm {
  return typeof value === "object" && value !== null && "setErrors" in value;
}

const errorWithActionCode = z.object({
  message: z.string(),
  data: z.object({ actionCode: z.string() }),
});

function failureFields(
  error: unknown,
  failures: Partial<Record<string, string>> = {},
): Fields | undefined {
  const failure = errorWithActionCode.safeParse(error).data;
  const field = failure && failures[failure.data.actionCode];

  return field ? { [field]: [failure.message] } : undefined;
}

function valueAt(state: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined,
      state,
    );
}

/**
 * Binds a shared Zod schema and a mutation to form state, for a Nuxt UI
 * `<UForm>` or a plain `<form>`.
 *
 * Auto-imported. Call it inside `setup()`. With `<UForm>`, bind `ref`,
 * `schema`, `state` and `submit`: UForm validates with the schema before
 * anything is sent, and field errors the server returns (input validation,
 * a conflict on a single unique column) land under the matching
 * `<UFormField>` through its `setErrors` and stay there until that field's
 * value changes. So does an action's typed failure whose code `failures`
 * maps to a field. A server field message whose field is not a key of
 * `state`, such as `key` of `promoteUpload()` in a form with `imageKey`,
 * lands in `formError` and not under a field. After a failed submit the first
 * invalid field is focused. Any other failure lands in `formError` and is
 * announced through `useAnnouncer()`, so render `<NuxtAnnouncer>` in
 * `app.vue`. Without Nuxt UI, `submit()` validates `state` itself and fills
 * `errors` per field (the {@link ValidationError} shape) from both the
 * schema and the server. Pass `$api.<path>.mutationOptions()`, with
 * `toast` or `optimistic` if needed. A submit while the mutation
 * runs does nothing. Every submit sends the one idempotency key of those
 * options, so a procedure with `idempotent()` answers a repeat of the
 * same state with the first result instead of running again.
 *
 * The schema only checks the state in the browser: the mutation receives
 * the state as typed (`z.input`), unparsed, so a schema that coerces or
 * transforms is parsed once, by the procedure on the server.
 *
 * An edit form (one whose `defaults` hold an `id`) asks before the user
 * leaves with unsaved changes; see `warnUnsaved`.
 *
 * @param schema - The action's input schema, from `shared/schemas/`.
 * @param mutationOptions - What `useMutation()` would receive.
 * @param options - See {@link ActionFormOptions}.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const form = useActionForm(createPostInput, $api.post.create.mutationOptions(), {
 *   defaults: { title: "", body: "" },
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
export function useActionForm<Schema extends z.ZodType, TResult>(
  schema: Schema,
  mutationOptions: { mutation: (vars: z.input<Schema>) => Promise<TResult> },
  options: ActionFormOptions<Schema, TResult>,
) {
  const { mutateAsync, isLoading } = useMutation(mutationOptions);
  const announcer = useAnnouncer();
  // a blank default cannot reach the mutation: the schema check in submit() rejects it first
  const state = ref(options.defaults as z.input<Schema>);
  const errors = ref<Fields>({});
  const formError = ref<string>();
  const boundForm = shallowRef<BoundForm>();
  const rejected = shallowRef<{ fields: Fields; values: Record<string, unknown> }>();
  let savedState = JSON.stringify(options.defaults);
  const unsaved = () => JSON.stringify(toRaw(state.value)) !== savedState;

  if ((options.warnUnsaved ?? hasId(options.defaults)) && getCurrentInstance()) {
    const { ts } = useI18n();
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (unsaved()) event.preventDefault();
    };

    onBeforeRouteLeave(() => !unsaved() || window.confirm(ts("nuxvel.actionForm.unsavedChanges")));
    onMounted(() => window.addEventListener("beforeunload", warnBeforeUnload));
    onBeforeUnmount(() => window.removeEventListener("beforeunload", warnBeforeUnload));
  }

  function rejectedIssues(value: unknown) {
    const { fields, values } = rejected.value ?? { fields: {}, values: {} };

    return Object.entries(fields).flatMap(([path, messages]) =>
      Object.is(valueAt(value, path), values[path])
        ? messages.map((message) => ({ message, path: path.split(".") }))
        : [],
    );
  }

  const formSchema: { "~standard": z.core.$ZodStandardSchema<Schema> } = {
    "~standard": {
      ...schema["~standard"],
      async validate(value) {
        const result = await schema["~standard"].validate(value);
        const issues = [...(result.issues ?? []), ...rejectedIssues(value)];

        return issues.length ? { issues } : result;
      },
    },
  };

  function bindForm(instance: Element | ComponentPublicInstance | null) {
    boundForm.value = isBoundForm(instance) ? instance : undefined;
  }

  function focusFirstInvalidField() {
    const id = boundForm.value?.errors.find((error) => error.id)?.id;

    if (id) document.getElementById(id)?.focus();
  }

  watch(
    () => boundForm.value?.loading,
    (loading, wasLoading) => {
      if (wasLoading && !loading) focusFirstInvalidField();
    },
    { flush: "post" },
  );

  function showServerFields(all: Fields) {
    const fields: Fields = {};
    const unshown: string[] = [];

    for (const [path, messages] of Object.entries(all)) {
      if (Object.hasOwn(toRaw(state.value) as object, path.split(".")[0] ?? path)) {
        fields[path] = messages;
      } else {
        unshown.push(...messages);
      }
    }

    if (unshown.length) {
      formError.value = unshown.join(" ");
      announcer.assertive(formError.value);
    }

    errors.value = fields;
    rejected.value = {
      fields,
      values: Object.fromEntries(
        Object.keys(fields).map((path) => [path, valueAt(state.value, path)]),
      ),
    };
    boundForm.value?.setErrors(
      Object.entries(fields).flatMap(([name, messages]) =>
        messages.map((message) => ({ name, message })),
      ),
    );
  }

  async function submit() {
    if (isLoading.value) return;

    errors.value = {};
    formError.value = undefined;

    const parsed = schema.safeParse(state.value);

    if (!parsed.success) {
      errors.value = toValidationError(parsed.error).fields;
      return;
    }

    rejected.value = undefined;

    try {
      const submitted = structuredClone(toRaw(state.value));
      const result = await mutateAsync(submitted);
      savedState = JSON.stringify(submitted);
      await options.onSuccess?.(result);
    } catch (error) {
      if (error instanceof MutationCancelledError) return;

      const fields = serverFields(error) ?? failureFields(error, options.failures);

      if (fields) {
        showServerFields(fields);
        return;
      }

      formError.value = error instanceof Error ? error.message : String(error);
      announcer.assertive(formError.value);
    }
  }

  return reactive({
    ref: bindForm,
    schema: markRaw(formSchema),
    state,
    errors,
    formError,
    pending: isLoading,
    submit,
  });
}
