import { createError, defineEventHandler, getRequestHeader } from "h3";

export default defineEventHandler((event) => {
  const rules = event.context.security?.rules;
  const limiter = rules?.enabled ? rules.requestSizeLimiter : false;

  if (!limiter) return;

  if (getRequestHeader(event, "transfer-encoding") !== undefined) {
    throw createError({ statusCode: 411, statusMessage: "Length Required" });
  }

  const upload = getRequestHeader(event, "content-type")?.includes("multipart/form-data");
  const limit = upload ? limiter.maxUploadFileRequestInBytes : limiter.maxRequestSizeInBytes;

  if (limit !== undefined && Number(getRequestHeader(event, "content-length")) >= limit) {
    throw createError({ statusCode: 413, statusMessage: "Payload Too Large" });
  }
});
