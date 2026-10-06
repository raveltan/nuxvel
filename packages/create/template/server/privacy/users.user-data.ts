import { userTable } from "#nuxvel/schema";

export const usersUserData = defineUserData(userTable, userTable.id, { personal: [userTable.name, userTable.email] });
