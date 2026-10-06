import { pushSubscriptionsTable } from "#nuxvel/schema";

export const pushSubscriptionsUserData = defineUserData(pushSubscriptionsTable, pushSubscriptionsTable.userId);
