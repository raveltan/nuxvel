<script setup lang="ts">
import { UAvatar, UAvatarGroup, UTooltip } from "#components";
import type { PresenceMember } from "../../server/realtime/presence";

/**
 * A Nuxt UI `UAvatarGroup` of the members of a presence room, with each
 * member's name in a tooltip.
 *
 * Auto-registered as a component unless the app sets `nuxvel.ui:
 * false`. Pass the `members` of `usePresence()`, or a filtered list,
 * such as everyone but the current user. The group is labelled
 * `Viewing now`, in the current locale, and each avatar is an image
 * named after its member. A member without an `avatar` shows initials.
 *
 * @example
 * ```ts
 * const { user } = useUser();
 * const { members } = usePresence("posts", { id: 42 });
 * const others = computed(() => members.value.filter((member) => member.userId !== user.value?.id));
 * ```
 * ```vue
 * <PresenceAvatars :members="others" />
 * ```
 */
defineOptions({ name: "PresenceAvatars" });

const { max = 5 } = defineProps<{
  members: readonly PresenceMember<object>[];
  max?: number;
}>();
</script>

<template>
  <UAvatarGroup :max="max" size="sm" role="group" :aria-label="$ts('nuxvel.presenceAvatars.label')">
    <UTooltip v-for="member in members" :key="member.userId" :text="member.name">
      <UAvatar :src="member.avatar" :alt="member.name" role="img" :aria-label="member.name" />
    </UTooltip>
  </UAvatarGroup>
</template>
