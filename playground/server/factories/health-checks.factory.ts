import { defineFactory } from "@nuxvel/nuxt/factories";
import { healthChecksTable } from "#nuxvel/schema";

export const healthCheckFactory = defineFactory(healthChecksTable, { name: "before" });
