import { defineEventHandler } from "h3";

export default defineEventHandler((event) => ({
  status: "live",
  ...(event.context.nuxvelMaintenance ? { maintenance: true } : {}),
}));
