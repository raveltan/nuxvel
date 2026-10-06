<script setup lang="ts">
import { computed, inject, onBeforeUnmount } from "vue";
import { useI18n } from "#imports";
import { UFormField, UInput, UInputDate, UInputNumber, USelect, USwitch, UTextarea } from "#components";
import { CalendarDate, parseDate, type DateValue } from "@internationalized/date";
import formInputs from "#nuxvel/form-inputs";
import { actionFormKey } from "../forms/action-form-context";
import { humanize } from "../forms/form-fields";
import type { UploadName } from "../../server/storage/registry";
import UploadField from "./UploadField.vue";

/**
 * One field of the surrounding `<ActionForm>`: a `<UFormField>` with the
 * label, the input the schema gives the field, and its errors.
 *
 * Auto-registered as a component unless the app sets `nuxvel.ui:
 * false`. Put it anywhere in the default slot of `<ActionForm>` to lay
 * the fields out yourself. A `#field-<name>` slot of the form replaces
 * its input. Outside an `<ActionForm>`, or with a name that is not a key
 * of the schema, it throws. A component of `nuxvel.form.inputs` for
 * the field's kind replaces the default input.
 *
 * @example
 * ```vue
 * <ActionForm :action="$api.address.update" :defaults="address">
 *   <div class="grid grid-cols-2 gap-4">
 *     <ActionField name="street" />
 *     <ActionField name="city" />
 *   </div>
 * </ActionForm>
 * ```
 */
defineOptions({ name: "ActionField" });

const props = defineProps<{
  /** The key of the form schema this field edits. */
  name: string;
}>();

const form = inject(actionFormKey);
if (!form) throw new Error(`<ActionField name="${props.name}"> must be inside an <ActionForm>`);

const field = form.fields.find((candidate) => candidate.name === props.name);
if (!field) throw new Error(`<ActionField name="${props.name}">: the input schema of $api.${form.path} has no key "${props.name}"`);

const { has, ts } = useI18n();
const text = computed(() => form.text()[props.name] ?? {});
const translationKey = `${form.path}.fields.${props.name}`;
const label = computed(() => text.value.label ?? (has(translationKey) ? ts(translationKey) : humanize(props.name)));
// meta.upload is a plain string: UploadName is never while the app defines no upload
const uploadName = field.upload as UploadName | undefined;
const slot = form.slots[`field-${props.name}`];
const textTypes: Partial<Record<string, string>> = { text: "text", email: "email", url: "url" };
const defaultInputs = new Set(["text", "email", "url", "textarea", "select", "boolean", "number", "date", "richText"]);
const custom = field.input && Object.hasOwn(formInputs, field.input) ? formInputs[field.input] : undefined;
const upload = !custom && field.input === "upload" ? uploadName : undefined;
const rendered = Boolean(slot || custom || upload || (field.input && defaultInputs.has(field.input)));

if (rendered) {
  form.rendered.add(props.name);
  onBeforeUnmount(() => form.rendered.delete(props.name));
}

if (process.env.NODE_ENV !== "production" && !rendered) {
  console.warn(
    `<ActionForm>: $api.${form.path} has no default input for the field "${props.name}". Render it with a #field-${props.name} slot.`,
  );
}

const value = computed({
  get: () => form.state[props.name],
  set: (next: unknown) => {
    form.state[props.name] = next;
  },
});

const { nullable, optional } = field;

function emptyAs(next: unknown) {
  if (next !== "" && next !== null && next !== undefined) return next;
  if (nullable) return null;
  if (optional) return undefined;
  return next === "" ? "" : undefined;
}

const slotProps = computed(() => ({
  field: {
    ...text.value,
    name: props.name,
    label: label.value,
    get value() {
      return value.value;
    },
    set value(next: unknown) {
      value.value = next;
    },
  },
}));

function toDateValue(current: unknown) {
  if (current instanceof Date) {
    return Number.isNaN(current.getTime()) ? undefined : new CalendarDate(current.getUTCFullYear(), current.getUTCMonth() + 1, current.getUTCDate());
  }
  if (typeof current !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(current)) return undefined;
  try {
    return parseDate(current);
  } catch {
    return undefined;
  }
}

const dateValue = computed({
  get: () => toDateValue(value.value),
  set: (next: DateValue | null | undefined) => {
    value.value = next ? (field.dateAsString ? next.toString() : next.toDate("UTC")) : emptyAs(next);
  },
});

function typedValue<T>(isType: (current: unknown) => current is T) {
  return computed({
    get: () => (isType(value.value) ? value.value : undefined),
    set: (next: T | null | undefined) => {
      value.value = emptyAs(next);
    },
  });
}

const stringValue = typedValue((current): current is string => typeof current === "string");
const numberValue = typedValue((current): current is number => typeof current === "number");
const booleanValue = typedValue((current): current is boolean => typeof current === "boolean");

const SlotContent = () => slot?.(slotProps.value);
</script>

<template>
  <UploadField
    v-if="!slot && upload"
    v-model="stringValue"
    :name="upload"
    :field="name"
    :label="label"
    :hint="text.hint"
    :class="form.fieldClass()"
  />
  <UFormField v-else-if="rendered" :name="name" :label="label" :hint="text.hint" :class="form.fieldClass()">
    <SlotContent v-if="slot" />
    <component :is="custom" v-else-if="custom" v-model="value" :placeholder="text.placeholder" />
    <UInput
      v-else-if="field.input && textTypes[field.input]"
      v-model="stringValue"
      :type="textTypes[field.input]"
      :placeholder="text.placeholder"
      class="w-full"
    />
    <UTextarea v-else-if="field.input === 'textarea' || field.input === 'richText'" v-model="stringValue" :placeholder="text.placeholder" class="w-full" />
    <USelect v-else-if="field.input === 'select'" v-model="stringValue" :items="field.items" :placeholder="text.placeholder" class="w-full" />
    <USwitch v-else-if="field.input === 'boolean'" v-model="booleanValue" />
    <UInputNumber v-else-if="field.input === 'number'" v-model="numberValue" :placeholder="text.placeholder" class="w-full" />
    <UInputDate v-else-if="field.input === 'date'" v-model="dateValue" class="w-full" />
  </UFormField>
</template>
