import { healthChecksTable } from "#nuxvel/schema";
import { defineUserData } from "@nuxvel/nuxt/server/privacy";

export const healthChecksUserData = defineUserData(healthChecksTable, healthChecksTable.userId);
