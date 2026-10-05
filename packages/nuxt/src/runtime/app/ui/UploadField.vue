<script setup lang="ts">
import { UFileUpload, UFormField, UProgress } from "#components";
import type { FileUploadProps } from "@nuxt/ui";
import { ref, watch, type PropType } from "vue";
import { useUpload } from "../composables/use-upload";
import type { UploadName } from "../../server/storage/registry";

/**
 * A Nuxt UI file field that uploads the chosen file to a
 * `defineUpload()` upload and gives back its storage key.
 *
 * Auto-registered as a component unless the app sets `nuxvel.ui:
 * false`. A chosen file goes through {@link useUpload}: `POST
 * /api/uploads/<name>` and a `PUT` to the presigned URL, with a progress
 * bar. `v-model` is optional and can be `undefined`, for an optional
 * image. It is the key under `tmp/<name>/` once the `PUT`
 * succeeds, and `""` before that or while a new file uploads. Bind it to a `useActionForm()` state field
 * and send the key to an action that calls `promoteUpload()`. A refused
 * file (too large, wrong type, not allowed) shows the server's message
 * under the field. Attributes such as `label` and `description` go to
 * the `<UFormField>`. The `uploading` slot replaces the progress bar
 * while a file uploads.
 *
 * @param name - The upload's name, as in `server/uploads/<name>.ts`.
 * @param accept - The file types the file picker offers, as in the
 * `accept` attribute. The server still checks `allowedTypes`.
 * @param field - The name of the form field in the surrounding `UForm`,
 * given to the `UFormField` as `name`. Set it to the state key that holds
 * the upload key (`coverKey`), so that a validation error on that key
 * shows under this field. It is not the upload name.
 * @param ui - Classes for the slots of the inner `UFileUpload`, as its
 * `ui` prop.
 *
 * @example
 * ```vue
 * <UploadField
 *   v-model="form.state.coverKey"
 *   name="post-cover"
 *   label="Cover image"
 *   accept="image/png,image/jpeg"
 * />
 * ```
 */
defineOptions({ name: "UploadField" });

const props = defineProps({
  // UploadName is never while the app defines no upload, and String is not comparable to never
  name: { type: String as unknown as PropType<UploadName>, required: true },
  accept: { type: String, default: undefined },
  field: { type: String, default: undefined },
  ui: { type: Object as PropType<FileUploadProps["ui"]> },
});
const key = defineModel<string | undefined>();

defineSlots<{
  /** Replaces the progress bar while a file uploads. `progress` goes from 0 to 100, and is `null` while the size is unknown. */
  uploading?(props: { file: File; progress: number | null }): unknown;
}>();

const { upload, uploading, progress } = useUpload(() => props.name);
const file = ref<File | null>(null);
const failure = ref<string>();

watch(file, async (chosen) => {
  key.value = "";
  failure.value = undefined;

  if (!chosen) return;

  try {
    const uploaded = await upload(chosen);
    if (file.value === chosen) key.value = uploaded;
  } catch (error) {
    if (file.value === chosen) failure.value = error instanceof Error ? error.message : String(error);
  }
});
</script>

<template>
  <UFormField :name="field" :error="failure">
    <UFileUpload
      v-model="file"
      :accept="accept"
      :preview="false"
      :disabled="uploading"
      :label="$ts('nuxvel.uploadField.drop')"
      :ui="ui"
      class="w-full"
    />
    <template v-if="uploading">
      <slot v-if="file" name="uploading" :file="file" :progress="progress">
        <UProgress :model-value="progress" :aria-label="$ts('nuxvel.uploadField.uploading', { file: file.name })" class="mt-2" />
      </slot>
    </template>
  </UFormField>
</template>
