import type { InjectionKey, Slot } from "vue";
import type { FormField } from "./form-fields";

/** The texts of one field of `<ActionForm>`, as its `fields` prop takes them. */
export interface ActionFormFieldText {
  /** The label, in place of the `<action path>.fields.<name>` translation or the humanized name. */
  label?: string;
  /** The placeholder of the input. */
  placeholder?: string;
  /** The hint next to the label, as the `hint` of `<UFormField>`. */
  hint?: string;
}

/**
 * The `field` that a `#field-<name>` slot of `<ActionForm>` gets. Bind
 * `v-model="field.value"` to your input: it reads and writes the form
 * state.
 */
export interface ActionFormField<Value> extends Omit<ActionFormFieldText, "label"> {
  /** The key of the schema this field edits. */
  name: string;
  /** The label: the `fields` prop, else the `<action path>.fields.<name>` translation, else the humanized name. */
  label: string;
  /** The value of the field in the form state, with the type of the schema field. Setting it updates the state. */
  value: Value;
}

/** Classes for the slots of `<ActionForm>`, as its `ui` prop and `app.config.ts` `ui.actionForm.slots` take them. */
export interface ActionFormUi {
  /** The `<UForm>`. */
  root?: string;
  /** Each `<UFormField>`. */
  field?: string;
  /** The wrapper of the submit button or of the `#actions` slot. */
  actions?: string;
}

export const actionFormTheme = {
  slots: { root: "space-y-4", field: "", actions: "flex gap-2" },
};

export interface ActionFormContext {
  path: string;
  state: Record<string, unknown>;
  fields: FormField[];
  text: () => Partial<Record<string, ActionFormFieldText>>;
  rendered: Set<string>;
  slots: Partial<Record<string, Slot>>;
  fieldClass: () => string;
}

export const actionFormKey: InjectionKey<ActionFormContext> = Symbol("ActionForm");
