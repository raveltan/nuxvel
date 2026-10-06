import { reactive, ref } from "vue";
import { z } from "zod";
import { toValidationError, type ValidationError } from "../../shared/errors/validation";
import { serverFields } from "../forms/server-fields";

/**
 * Holds the errors of a form that is not built with {@link useActionForm}:
 * messages per field, and one message for the rest.
 *
 * Auto-imported. `set(error)` takes what a failed call threw. A tRPC error
 * with `data.fields` (a failed `.input()` schema, a
 * {@link ValidationFailedError}, a conflict on one unique column), a
 * `$fetch` error from a plain route in the same shape, or a `ZodError`
 * from checking the form in the browser fills `fields`, keyed by field
 * path. Any other error goes to `formError`. `clear()` empties both.
 * Prefer {@link useActionForm}, which does this for you; reach for this
 * when a form calls something else.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const errors = useFormErrors();
 * const title = ref("");
 *
 * async function save() {
 *   errors.clear();
 *   try {
 *     await $api.post.create.mutate({ title: title.value, body: "" });
 *   } catch (error) {
 *     errors.set(error);
 *   }
 * }
 * </script>
 *
 * <template>
 *   <form @submit.prevent="save">
 *     <input v-model="title" aria-label="Title" />
 *     <p v-for="message in errors.fields.title" :key="message">{{ message }}</p>
 *     <p v-if="errors.formError" role="alert">{{ errors.formError }}</p>
 *   </form>
 * </template>
 * ```
 */
export function useFormErrors() {
  const fields = ref<ValidationError["fields"]>({});
  const formError = ref<string>();

  function set(error: unknown) {
    const found =
      error instanceof z.ZodError
        ? toValidationError(error).fields
        : (serverFields(error) ?? (typeof error === "object" && error && "data" in error ? serverFields(error.data) : undefined));

    fields.value = found ?? {};
    formError.value = found ? undefined : error instanceof Error ? error.message : String(error);
  }

  function clear() {
    fields.value = {};
    formError.value = undefined;
  }

  return reactive({ fields, formError, set, clear });
}
