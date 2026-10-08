import { defineUpload } from "@nuxvel/nuxt/server/storage";
import type { FileSize } from "@nuxvel/nuxt/server/storage";

function refusal(maxSize: FileSize) {
  try {
    return defineUpload({ maxSize, allowedTypes: ["image/png"] }).maxSize;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export default defineEventHandler(() => ({
  megabytes: refusal("2 MB"),
  // a probe of what a JavaScript caller can pass despite the type
  unknownUnit: refusal("2 megabytes" as FileSize),
  zero: refusal("0 B"),
  notANumber: refusal(Number.NaN),
  belowOneByte: refusal(0.5),
}));
