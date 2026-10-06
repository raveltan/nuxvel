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
import {
  toValidationError,
  type ValidationError,
} from "../../shared/errors/validation";
import { MutationCancelledError } from "../trpc/options-proxy";
import { serverFields } from "./server-fields";

interface FormBehavior<TResult> {
  defaults: unknown;
  onSuccess?: (result: TResult) => unknown;
  failures?: Partial<Record<string, string>>;
  warnUnsaved?: boolean;
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

export function bindActionForm<Schema extends z.ZodType, TResult>(
  schema: Schema,
  mutationOptions: { mutation: (vars: z.input<Schema>) => Promise<TResult> },
  options: FormBehavior<TResult>,
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

  if (options.warnUnsaved && getCurrentInstance()) {
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
      const raw: unknown = toRaw(state.value);
      if (typeof raw === "object" && raw !== null && Object.hasOwn(raw, path.split(".")[0] ?? path)) {
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

      const fields = failureFields(error, options.failures) ?? serverFields(error);

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
