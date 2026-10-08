import { useLogger } from "@nuxvel/nuxt/server/observability";

export default defineEventHandler(() => {
  const cause = new Error("log-span-check inner");

  useLogger("log-span-check").warn("log-span-check warned", { detail: 1, password: "log-span-secret" }, new Error("log-span-check outer", { cause }));

  return { logged: true };
});
