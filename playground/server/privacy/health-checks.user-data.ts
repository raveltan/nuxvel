import { healthChecksTable } from "../database/schema/health-check.schema";

export const healthChecksUserData = defineUserData(healthChecksTable, healthChecksTable.userId);
