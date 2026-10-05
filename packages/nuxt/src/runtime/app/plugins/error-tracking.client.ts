import { defineNuxtPlugin, useRuntimeConfig } from "#app";
import * as Sentry from "@sentry/vue";

function withoutQuery(url: string) {
  const [path = ""] = url.split(/[?#]/);

  return path;
}

function breadcrumbWithoutQuery(breadcrumb: Sentry.Breadcrumb) {
  if (!breadcrumb.data) return breadcrumb;

  const data = Object.fromEntries(
    Object.entries(breadcrumb.data).map(([key, value]) =>
      ["url", "from", "to"].includes(key) && typeof value === "string"
        ? [key, withoutQuery(value)]
        : [key, value],
    ),
  );

  return { ...breadcrumb, data };
}

function eventWithoutQuery(event: Sentry.ErrorEvent) {
  if (!event.request) return event;

  const { url, headers } = event.request;
  const userAgent = headers?.["User-Agent"];

  return {
    ...event,
    request: {
      ...(url && { url: withoutQuery(url) }),
      ...(userAgent && { headers: { "User-Agent": userAgent } }),
    },
  };
}

/**
 * Reports unhandled browser errors — Vue component and event-handler
 * errors, uncaught exceptions, unhandled rejections — to the error
 * tracker named by `NUXT_PUBLIC_SENTRY_DSN`. Does nothing when it is empty.
 * Events and breadcrumbs keep the URL path only: no query string and no
 * fragment.
 */
export default defineNuxtPlugin({
  name: "nuxvel:error-tracking",
  setup(nuxtApp) {
    const dsn = useRuntimeConfig().public.sentryDsn;

    if (!dsn) return;

    Sentry.init({
      app: nuxtApp.vueApp,
      dsn,
      sendDefaultPii: false,
      beforeSend: eventWithoutQuery,
      beforeBreadcrumb: breadcrumbWithoutQuery,
    });
  },
});
