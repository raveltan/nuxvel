import { webhookEndpointsTable } from "#nuxvel/schema";
import { allowGuest, allowSystem, definePolicy } from "@nuxvel/nuxt/server/authorization";

export const webhookEndpointsPolicy = definePolicy(webhookEndpointsTable, {
  watch: allowSystem(allowGuest(() => true)),
  follow: allowGuest(allowSystem(() => true)),
});
