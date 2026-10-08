import { healthChecksTable } from "#nuxvel/schema";
import { defineUserData } from "@nuxvel/nuxt/server/privacy";

export default defineUserData(healthChecksTable, healthChecksTable.name);
