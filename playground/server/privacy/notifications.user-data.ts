import { notificationsTable } from "#nuxvel/schema";

export const notificationsUserData = defineUserData(notificationsTable, notificationsTable.userId);
