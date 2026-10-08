import { flagExposuresTable } from "#nuxvel/schema";
import { defineUserData } from "@nuxvel/nuxt/server/privacy";

export const flagExposuresUserData = defineUserData(flagExposuresTable, flagExposuresTable.unitId);
