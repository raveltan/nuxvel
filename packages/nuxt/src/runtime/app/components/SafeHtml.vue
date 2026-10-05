<script setup lang="ts">
import type { SanitizedHtml } from "../../shared/ugc/sanitize-html";

/**
 * Renders HTML that {@link sanitizeHtml} cleaned, inside a `<div>`.
 *
 * Auto-registered as a component. `html` must be a
 * {@link SanitizedHtml}, so a plain `string` fails the typecheck. It is
 * the only place an app renders an HTML string: the architecture lint
 * preset reports every `v-html` under `app/`.
 *
 * @example
 * ```vue
 * <SafeHtml :html="post.body" />
 * ```
 */
defineOptions({ name: "SafeHtml" });

defineProps<{
  /** The HTML to render, as {@link sanitizeHtml} or `richText()` returned it. */
  html: SanitizedHtml;
}>();
</script>

<template>
  <div v-html="html" />
</template>
