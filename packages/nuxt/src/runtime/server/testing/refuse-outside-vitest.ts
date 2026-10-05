import { createError } from "h3";

export function refuseOutsideVitest() {
  if (!process.env.VITEST) {
    throw createError({ statusCode: 404, statusMessage: "Not Found" });
  }
}
