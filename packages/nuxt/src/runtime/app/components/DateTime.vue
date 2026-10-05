<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useState } from "#app";
import { useI18n } from "#imports";
import { useTimezone } from "../composables/use-timezone";

/**
 * Renders a date as a `<time>` element, formatted the same on the server
 * and during hydration.
 *
 * Auto-registered as a component. It formats in {@link useTimezone}'s
 * timezone and in the `iso` of the current i18n locale, so the
 * server-rendered text and the hydrated DOM always match; after hydration
 * it re-renders in the browser's own timezone if that differs. With
 * `relative`, it shows the distance from now instead, such as `5 minutes
 * ago`: measured from the server's render time until it mounts, then from
 * the browser's clock.
 *
 * @example
 * ```vue
 * <DateTime :value="post.createdAt" />
 * <DateTime :value="post.createdAt" :options="{ dateStyle: 'long' }" locale="en-GB" />
 * <DateTime :value="comment.createdAt" relative />
 * ```
 */
defineOptions({ name: "DateTime" });

const props = withDefaults(
  defineProps<{
    /** The instant to show: a `Date`, an ISO string or epoch milliseconds. */
    value: Date | string | number;
    /** The BCP 47 locale to format in. Defaults to the `iso` of the current i18n locale, for example `zh-CN` on a `/zh` page. */
    locale?: string;
    /** `Intl.DateTimeFormat` options. Defaults to a medium date and short time; `timeZone` is ignored. */
    options?: Intl.DateTimeFormatOptions;
    /** Shows the distance from now, such as `5 minutes ago`, instead of the date. */
    relative?: boolean;
  }>(),
  {
    options: () => ({ dateStyle: "medium", timeStyle: "short" }),
    relative: false,
  },
);

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
  ["second", 1],
];

const timezone = useTimezone();
const { getLocale, getLocales } = useI18n();
const locale = computed(() => props.locale ?? getLocales().find(({ code }) => code === getLocale())?.iso ?? getLocale());
const now = useState("nuxvel:now", () => Date.now());
const date = computed(() => new Date(props.value));

function relativeText() {
  const seconds = Math.round((date.value.getTime() - now.value) / 1000);
  const [unit, size] = UNITS.find(([, length]) => Math.abs(seconds) >= length) ?? ["second", 1];

  return new Intl.RelativeTimeFormat(locale.value, { numeric: "auto" }).format(Math.round(seconds / size), unit);
}

const text = computed(() =>
  props.relative
    ? relativeText()
    : new Intl.DateTimeFormat(locale.value, {
        ...props.options,
        timeZone: timezone.value,
      }).format(date.value),
);

onMounted(() => {
  if (props.relative) now.value = Date.now();
});
</script>

<template>
  <time :datetime="date.toISOString()">{{ text }}</time>
</template>
