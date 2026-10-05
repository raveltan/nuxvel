import { type H3Error, type H3Event, setResponseHeader } from "h3";
import { classifyError } from "./classify";
import { genericErrorMessage } from "./generic-message";
import { isMaintenanceError } from "../maintenance/maintenance-error";
import { z } from "zod";
import { type TaxonomyError, ValidationFailedError, isKnownTaxonomyError, isTaxonomyError } from "./taxonomy";

function routeErrorData(error: TaxonomyError, requestId: string | undefined) {
  if (isMaintenanceError(error)) {
    return { code: "MAINTENANCE", message: error.message, retryAfter: error.retryAfter };
  }

  if (isTaxonomyError(error, "SERVICE_UNAVAILABLE")) {
    return { code: error.code, message: error.message, requestId };
  }

  if (isTaxonomyError(error, "BAD_REQUEST")) {
    return { code: "VALIDATION_ERROR", message: error.message, fields: error.fields };
  }

  if (isTaxonomyError(error, "CONFLICT") && error.field) {
    return { code: error.code, message: error.message, fields: { [error.field]: [error.message] } };
  }

  if (isTaxonomyError(error, "TOO_MANY_REQUESTS") && error.retryAfter !== undefined) {
    return { code: error.code, message: error.message, retryAfter: error.retryAfter };
  }

  return { code: error.code, message: error.message };
}

function validatorFailure(error: H3Error) {
  // h3's readValidatedBody and getValidatedQuery keep the validator's error as data, not cause
  return error.data instanceof z.ZodError ? new ValidationFailedError(error.data) : undefined;
}

export function routeTaxonomyError(error: H3Error): TaxonomyError | undefined {
  const taxonomy = classifyError(error.cause) ?? validatorFailure(error) ?? error.cause;

  return isKnownTaxonomyError(taxonomy) ? taxonomy : undefined;
}

export function isUnexpectedRouteError(error: H3Error): boolean {
  const taxonomy = routeTaxonomyError(error);

  if (taxonomy) return taxonomy.code === "INTERNAL_SERVER_ERROR";

  return error.statusCode >= 500 || error.unhandled || error.cause instanceof Error;
}

function hideDetails(error: H3Error, requestId: string | undefined) {
  const message = genericErrorMessage(requestId);

  error.unhandled = false;
  error.statusCode = 500;
  error.statusMessage = "Server Error";
  error.message = message;
  error.data = { code: "INTERNAL_SERVER_ERROR", message, requestId };
}

export function answerAsTaxonomyError(error: H3Error, event: H3Event) {
  const requestId = event.context.nuxvelRequestId;

  if (isUnexpectedRouteError(error)) return hideDetails(error, requestId);

  const taxonomy = routeTaxonomyError(error);

  if (!taxonomy) return;

  error.unhandled = false;
  error.statusCode = taxonomy.statusCode;
  error.statusMessage = taxonomy.message;
  error.message = taxonomy.message;
  error.data = routeErrorData(taxonomy, requestId);

  if (isTaxonomyError(taxonomy, "TOO_MANY_REQUESTS") && taxonomy.retryAfter !== undefined) {
    setResponseHeader(event, "retry-after", taxonomy.retryAfter);
  }
}
