import { useDb } from "@nuxvel/nuxt/server/database";

export default defineEventHandler(() => {
  const db = useDb();

  return { max: "$client" in db ? db.$client.options.max : null };
});
