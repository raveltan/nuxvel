import { healthChecksTable } from "../database/schema/health-check.schema";

export default defineUserData(healthChecksTable, healthChecksTable.name);
