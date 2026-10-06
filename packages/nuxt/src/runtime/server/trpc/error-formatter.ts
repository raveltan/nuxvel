import type { TRPC_ERROR_CODE_KEY, TRPCDefaultErrorShape, TRPCError } from "@trpc/server";
import { useRuntimeConfig } from "nitropack/runtime";
import { isTaxonomyError } from "../errors/taxonomy";
import type { ValidationError } from "../errors/validation";
import { genericErrorMessage } from "../errors/generic-message";
import { currentRequestId } from "./context";
import { errorExtras } from "./error-extras";
import type { TRPCContext } from "./trpc";
import { CLIENT_OUTDATED } from "../../shared/trpc/build-id-header";
import type { NETWORK_ERROR } from "../../shared/trpc/network-error";

/**
 * The error shape every procedure sends: tRPC's default, plus
 * `data.fields` — messages per input field, in the {@link ValidationError}
 * shape — when the error belongs to specific fields, and
 * `data.actionCode` — the declared code — when an action `fail()`ed
 * (with `data.fields` too when the failure has a `field`), and
 * `data.retryAfter` — seconds until the next attempt fits — when a
 * {@link RateLimitedError} carries one, and `data.maintenance` with
 * `data.retryAfter` when the app is in maintenance mode (`nuxvel down`),
 * and `data.requestId` — the {@link currentRequestId} — on a `500` or a
 * `503` that is not maintenance. `data.code` is `CLIENT_OUTDATED` when a
 * browser from an older build calls a procedure this build no longer
 * has, with `data.buildId` the live build; the app then reloads on its
 * next navigation. The server never sends `NETWORK_ERROR`. The client
 * sets it, with `data.httpStatus` `0`, when a call gets no tRPC answer.
 */
export interface NuxvelErrorShape extends Omit<TRPCDefaultErrorShape, "data"> {
  data: Omit<TRPCDefaultErrorShape["data"], "code"> & {
    code: TRPC_ERROR_CODE_KEY | typeof CLIENT_OUTDATED | typeof NETWORK_ERROR;
    fields?: ValidationError["fields"];
    actionCode?: string;
    retryAfter?: number;
    maintenance?: true;
    requestId?: string;
    buildId?: string;
  };
}

export function isRemovedProcedure(error: TRPCError) {
  return error.code === "NOT_FOUND" && !isTaxonomyError(error, "NOT_FOUND");
}

/**
 * Keeps error messages safe, in development and in production alike:
 * every `INTERNAL_SERVER_ERROR`, an {@link UnknownError} included, leaves
 * the server as "Something went wrong (ref: <request id>)", with no stack.
 * The log and the DevTools entry of that request ID keep the real error.
 * Other taxonomy errors keep their message.
 * Input validation failures — a procedure's `.input()` schema or a
 * {@link ValidationFailedError} — and single-column conflicts carry
 * `data.fields`, in production too; an {@link ActionError} carries
 * `data.actionCode`, and also `data.fields` with its message under its
 * `field` when the action declares one; a {@link RateLimitedError}
 * carries `data.retryAfter`. Errors are recognised by their taxonomy code and
 * Zod's own error check, not `instanceof`, so a second copy of a module
 * cannot hide one.
 */
export function errorFormatter({
  shape,
  error,
  ctx,
}: {
  shape: TRPCDefaultErrorShape;
  error: TRPCError;
  ctx?: TRPCContext;
}): NuxvelErrorShape {
  const { buildId } = useRuntimeConfig().app;

  if (isRemovedProcedure(error) && ctx?.clientBuildId && ctx.clientBuildId !== buildId) {
    return { ...shape, data: { ...shape.data, code: CLIENT_OUTDATED, buildId } };
  }

  const extras = errorExtras(error);

  if (extras) return { ...shape, data: { ...shape.data, ...extras } };

  if (error.code !== "INTERNAL_SERVER_ERROR" && error.code !== "SERVICE_UNAVAILABLE") return shape;

  const requestId = currentRequestId();
  const withRequestId = { ...shape, data: { ...shape.data, requestId } };

  if (error.code === "SERVICE_UNAVAILABLE") return withRequestId;

  return { ...withRequestId, message: genericErrorMessage(requestId) };
}
