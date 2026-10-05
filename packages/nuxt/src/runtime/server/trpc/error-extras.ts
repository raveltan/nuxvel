import type { TRPCError } from "@trpc/server";
import { z } from "zod";
import { isTaxonomyError } from "../errors/taxonomy";
import { toValidationError, type ValidationError } from "../errors/validation";
import { isMaintenanceError } from "../maintenance/maintenance-error";
import type { NuxvelErrorShape } from "./error-formatter";

export function errorFields(error: TRPCError): ValidationError["fields"] | undefined {
  if (error.code === "BAD_REQUEST" && error.cause instanceof z.core.$ZodError) {
    return toValidationError(error.cause).fields;
  }

  if (isTaxonomyError(error, "BAD_REQUEST")) return error.fields;

  if (isTaxonomyError(error, "CONFLICT") && error.field) {
    return { [error.field]: [error.message] };
  }

  return undefined;
}

export function errorExtras(
  error: TRPCError,
): Pick<NuxvelErrorShape["data"], "fields" | "actionCode" | "retryAfter" | "maintenance"> | undefined {
  if (isTaxonomyError(error, "UNPROCESSABLE_CONTENT")) return { actionCode: error.actionCode };

  if (isTaxonomyError(error, "TOO_MANY_REQUESTS") && error.retryAfter !== undefined) {
    return { retryAfter: error.retryAfter };
  }

  if (isMaintenanceError(error)) return { retryAfter: error.retryAfter, maintenance: true };

  const fields = errorFields(error);

  return fields && { fields };
}
