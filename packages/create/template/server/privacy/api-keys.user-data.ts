import { apiKeysTable } from "../database/schema/api-keys.schema";

export const apiKeysUserData = defineUserData(apiKeysTable, apiKeysTable.userId);
