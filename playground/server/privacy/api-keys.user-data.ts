import { apiKeysTable } from "#nuxvel/schema";

export const apiKeysUserData = defineUserData(apiKeysTable, apiKeysTable.userId);
