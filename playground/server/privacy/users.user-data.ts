import { userTable } from "../database/schema/auth.schema";

export const usersUserData = defineUserData(userTable, userTable.id, { personal: [userTable.name, userTable.email] });
