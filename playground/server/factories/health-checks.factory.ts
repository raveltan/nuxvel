import { defineFactory } from "@nuxvel/nuxt/factories";
import { healthChecksTable } from "../database/schema/health-check.schema";

export const healthCheckFactory = defineFactory(healthChecksTable, { name: "before" });
