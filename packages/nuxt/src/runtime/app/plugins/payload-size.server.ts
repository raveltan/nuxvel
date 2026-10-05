import { defineNuxtPlugin } from "#app";

const WARN_AT_BYTES = 100 * 1024;
const LISTED_QUERIES = 3;

function jsonBytes(value: unknown) {
  try {
    return Buffer.byteLength(JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item)) ?? "");
  } catch {
    return 0;
  }
}

function kilobytes(bytes: number) {
  return `${Math.round(bytes / 1024)} KB`;
}

export default defineNuxtPlugin({
  name: "nuxvel:payload-size",
  dependsOn: ["Pinia Colada"],
  setup(nuxtApp) {
    nuxtApp.hooks.hook("app:rendered", ({ ssrContext }) => {
      if (!ssrContext || ssrContext.noSSR) return;

      const total = jsonBytes(ssrContext.payload);

      if (total <= WARN_AT_BYTES) return;

      const queries: Record<string, unknown> = Reflect.get(ssrContext.payload, "pinia_colada") ?? {};
      const largest = Object.entries(queries)
        .map(([key, entry]) => ({ key, bytes: jsonBytes(entry) }))
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, LISTED_QUERIES)
        .map(({ key, bytes }) => `  ${key} ${kilobytes(bytes)}`);

      console.warn(
        [`The payload of ${ssrContext.url} is ${kilobytes(total)}, over ${kilobytes(WARN_AT_BYTES)}. Largest queries:`, ...largest].join("\n"),
      );
    });
  },
});
