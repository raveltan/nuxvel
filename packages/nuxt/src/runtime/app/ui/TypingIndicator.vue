<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "#imports";
import type { PresenceMember } from "../../server/realtime/presence";

/**
 * A line of text that names the members of a presence room who are
 * typing, such as `Ada is typing…`, in the current locale.
 *
 * Auto-registered as a component unless the app sets `nuxvel.ui:
 * false`. It needs a channel whose `presence.state` has a `typing`
 * boolean. Pass the `members` of `usePresence()` without the current
 * user. The line is a polite live region, so a screen reader announces
 * it, and it is empty while nobody types.
 *
 * @example
 * ```vue
 * <TypingIndicator :members="others" />
 * ```
 */
defineOptions({ name: "TypingIndicator" });

const props = defineProps<{ members: readonly PresenceMember<{ typing?: boolean }>[] }>();
const { ts } = useI18n();

const text = computed(() => {
  const [first, second, ...rest] = props.members.filter((member) => member.state.typing).map((member) => member.name);

  if (first === undefined) return "";
  if (second === undefined) return ts("nuxvel.typingIndicator.one", { name: first });
  if (rest.length === 0) return ts("nuxvel.typingIndicator.two", { first, second });

  return ts("nuxvel.typingIndicator.many", { first, count: rest.length + 1 });
});
</script>

<template>
  <p role="status" aria-live="polite" class="min-h-5 text-sm text-muted">{{ text }}</p>
</template>
