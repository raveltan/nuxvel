import { createError, defineEventHandler, getRequestHeader, readValidatedBody } from "h3";
import { z } from "zod";
import { renderMail } from "../mail/render-mail";

const previewRequest = z.object({ name: z.string(), input: z.unknown() });

export default defineEventHandler(async (event) => {
  // a cross-site form can't send JSON without a CORS preflight, which this route never answers
  if (!getRequestHeader(event, "content-type")?.startsWith("application/json")) {
    throw createError({ statusCode: 415, statusMessage: "Send the preview request as JSON" });
  }

  const { name, input } = await readValidatedBody(event, previewRequest.parse);

  return renderMail(name, input);
});
