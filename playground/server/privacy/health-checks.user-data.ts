import { healthChecksTable } from "#nuxvel/schema";

export const healthChecksUserData = defineUserData(healthChecksTable, healthChecksTable.userId);
