import { apiKeysTable } from "#nuxvel/schema";
import { defineUserData } from "@nuxvel/nuxt/server/privacy";

export const apiKeysUserData = defineUserData(apiKeysTable, apiKeysTable.userId);
