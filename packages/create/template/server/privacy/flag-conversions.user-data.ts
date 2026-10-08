import { flagConversionsTable } from "#nuxvel/schema";
import { defineUserData } from "@nuxvel/nuxt/server/privacy";

export const flagConversionsUserData = defineUserData(flagConversionsTable, flagConversionsTable.unitId);
