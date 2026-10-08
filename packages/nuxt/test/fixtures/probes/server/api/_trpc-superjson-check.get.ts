import { useCaller } from "@nuxvel/nuxt/server/api";

export default defineEventHandler(async () => {
  const caller = useCaller();
  const { at } = await caller.health.now();
  return { isDate: at instanceof Date };
});
