<script setup lang="ts" generic="P extends FormProcedure">
import { computed, provide, reactive, ref, useSlots } from "vue";
import { useAppConfig } from "#app";
import { useI18n } from "#imports";
import { UAlert, UButton, UForm } from "#components";
import { tv } from "@nuxt/ui/utils/tv";
import type { z } from "zod";
import procedureInputs from "#nuxvel/procedure-inputs";
import { useActionForm, type ActionForm, type ActionFormOptions, type FormProcedure, type SchemaCheck, type SharedSchemaOf } from "../composables/use-action-form";
import {
  actionFormKey,
  actionFormTheme,
  type ActionFormField,
  type ActionFormFieldText,
  type ActionFormUi,
} from "../forms/action-form-context";
import { formFields } from "../forms/form-fields";
import { PROCEDURE_PATH } from "../trpc/options-proxy";
import ActionField from "./ActionField.vue";

/**
 * A form for a mutation of `$api`, with one field for each key of the
 * procedure's input schema from `shared/schemas/`.
 *
 * Auto-registered as a component unless the app sets `nuxvel.ui:
 * false`. It is {@link useActionForm} with the markup: validation,
 * server field errors, focus on the first invalid field, `formError`,
 * the toast, invalidation and the unsaved-changes guard work as there.
 * Each field gets the input of its type: `UInput` for a string (typed
 * for an email or a URL), `USelect` for an enum, `USwitch` for a
 * boolean, `UInputNumber` for a number, `UInputDate` for a date,
 * `UEditor` for `richText()` and `<UploadField>` for a field with
 * `.meta({ upload })`. `.meta({ input: "textarea" })` on the schema
 * field picks another input. The label is the translation
 * `<action path>.fields.<name>`, or the humanized name. A field with no
 * default input, such as an array of objects or a union, renders
 * nothing and warns in development: give it a `#field-<name>` slot.
 *
 * Go down a step when a prop is not enough: a `#field-<name>` slot for
 * one input, the default slot with {@link ActionField} for the layout,
 * then `useActionForm()` with your own `<UForm>`.
 *
 * @example
 * ```vue
 * <ActionForm
 *   :action="$api.team.addMember"
 *   :defaults="{ teamId }"
 *   hidden="teamId"
 *   :fields="{ email: { placeholder: 'ada@example.com' } }"
 *   submit-label="Add member"
 * />
 * ```
 */
defineOptions({ name: "ActionForm" });

type Schema = SharedSchemaOf<P> & z.ZodType;
type Input = z.input<Schema>;
type Name = Extract<keyof Input, string>;

const props = defineProps<{
  /** A mutation of `$api`, such as `$api.post.create`, whose input schema is in `shared/schemas/`. */
  action: P & NoInfer<SchemaCheck<P, Schema>>;
  /** The initial state, as the `defaults` of `useActionForm()`. */
  defaults?: Partial<Input>;
  /** The other options of `useActionForm()`, such as `toast`, `onSuccess`, `confirm`, `failures` and `warnUnsaved`. */
  options?: Omit<ActionFormOptions<Schema, P>, "defaults" | "schema">;
  /** The label, placeholder and hint of each field, by name. */
  fields?: { [K in Name]?: ActionFormFieldText };
  /** The text of the submit button. Defaults to the `nuxvel.actionForm.submit` translation, "Save". */
  submitLabel?: string;
  /** The fields the form keeps in its state but does not show, such as an `id` from `defaults`. */
  hidden?: Name | Name[];
  /** Classes for the `<UForm>`, merged after `ui.root`. */
  class?: string;
  /** Classes for the slots of the form (`root`, `field`, `actions`), merged over `app.config.ts` `ui.actionForm.slots`. */
  ui?: ActionFormUi;
}>();

defineSlots<
  {
    /** Replaces the list of fields. Put {@link ActionField} components in it for your own layout. */
    default?(): unknown;
    /** Replaces the submit button. `pending` is `true` while the mutation runs. */
    actions?(props: { pending: boolean }): unknown;
  } & {
    /** Replaces the input of one field, inside its `<UFormField>`. Bind `v-model="field.value"`. */
    [K in Name as `field-${K}`]?: (props: { field: ActionFormField<Input[K]> }) => unknown;
  }
>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const slots = useSlots();
const { ts } = useI18n();
const path = props.action[PROCEDURE_PATH];
const registered: Partial<Record<string, z.ZodType>> = procedureInputs;
const schema = registered[path];
if (!schema) throw new Error(`<ActionForm>: $api.${path} has no input schema in shared/schemas/`);

// TS cannot prove that a spread of a generic Omit plus the omitted key is the type it came from
const options = { ...props.options, defaults: props.defaults } as ActionFormOptions<Schema, P>;
const form: ActionForm<z.ZodType> = useActionForm<P, Schema>(props.action, options);
const state: Record<string, unknown> = isRecord(form.state) ? form.state : {};
const fields = formFields(schema);
const shown = computed(() => {
  const hidden = new Set<string>([props.hidden ?? []].flat());
  return fields.filter((field) => !hidden.has(field.name));
});
const rendered = reactive(new Set<string>());
const clientErrors = ref<{ name?: string; message: string }[]>([]);

function submit() {
  clientErrors.value = [];
  return form.submit();
}

const formError = computed(() => {
  const errors = [
    ...clientErrors.value.map(({ name = "", message }) => ({ name, message })),
    ...Object.entries(form.errors).flatMap(([name, messages]) => messages.map((message) => ({ name, message }))),
  ];
  const unshown = errors.filter(({ name }) => !rendered.has(name.split(".")[0] ?? name)).map(({ message }) => message);
  return [...new Set([form.formError, ...unshown])].filter(Boolean).join(" ") || undefined;
});

const appConfig = useAppConfig();
const appTheme = "actionForm" in appConfig.ui && typeof appConfig.ui.actionForm === "object" ? appConfig.ui.actionForm : undefined;
const ui = computed(() => tv({ extend: actionFormTheme, ...appTheme })());

provide(actionFormKey, {
  path,
  state,
  fields,
  text: () => props.fields ?? {},
  rendered,
  slots,
  fieldClass: () => ui.value.field({ class: props.ui?.field }),
});
</script>

<template>
  <UForm
    :ref="form.ref"
    :schema="form.schema"
    :state="state"
    :class="ui.root({ class: [props.ui?.root, props.class] })"
    @submit="submit"
    @error="clientErrors = $event.errors"
  >
    <slot>
      <ActionField v-for="field in shown" :key="field.name" :name="field.name" />
    </slot>
    <UAlert v-if="formError" color="error" :title="formError" />
    <div :class="ui.actions({ class: props.ui?.actions })">
      <slot name="actions" :pending="form.pending">
        <UButton type="submit" :loading="form.pending" :label="submitLabel ?? ts('nuxvel.actionForm.submit')" />
      </slot>
    </div>
  </UForm>
</template>
