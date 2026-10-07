import { useStripe } from "@nuxvel/nuxt/server/billing";

export default defineEventHandler(async () => {
  try {
    const balance = await useStripe().balance.retrieve();

    return { object: balance.object };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
});
