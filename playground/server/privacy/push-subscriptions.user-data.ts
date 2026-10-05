import { pushSubscriptionsTable } from "../database/schema/push-subscriptions.schema";

export const pushSubscriptionsUserData = defineUserData(pushSubscriptionsTable, pushSubscriptionsTable.userId);
