import { notificationsTable } from "../database/schema/notifications.schema";

export const notificationsUserData = defineUserData(notificationsTable, notificationsTable.userId);
