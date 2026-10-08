import { userTable } from "#nuxvel/schema";
import { defineUserData } from "@nuxvel/nuxt/server/privacy";

export const usersUserData = defineUserData(userTable, userTable.id, { personal: [userTable.name, userTable.email] });
