import { notificationsTable } from "#nuxvel/schema";
import { defineUserData } from "@nuxvel/nuxt/server/privacy";

export const notificationsUserData = defineUserData(notificationsTable, notificationsTable.userId);
