import { webhookEndpointsTable } from "#nuxvel/schema";

export const webhookEndpointsPolicy = definePolicy(webhookEndpointsTable, {
  watch: allowSystem(allowGuest(() => true)),
  follow: allowGuest(allowSystem(() => true)),
});
