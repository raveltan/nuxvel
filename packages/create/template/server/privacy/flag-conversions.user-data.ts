import { flagConversionsTable } from "../database/schema/flag-conversions.schema";

export const flagConversionsUserData = defineUserData(flagConversionsTable, flagConversionsTable.unitId);
