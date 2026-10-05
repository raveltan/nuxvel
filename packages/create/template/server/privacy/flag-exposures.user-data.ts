import { flagExposuresTable } from "../database/schema/flag-exposures.schema";

export const flagExposuresUserData = defineUserData(flagExposuresTable, flagExposuresTable.unitId);
