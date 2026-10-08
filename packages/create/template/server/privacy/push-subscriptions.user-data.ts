import { pushSubscriptionsTable } from "#nuxvel/schema";
import { defineUserData } from "@nuxvel/nuxt/server/privacy";

export const pushSubscriptionsUserData = defineUserData(pushSubscriptionsTable, pushSubscriptionsTable.userId);
