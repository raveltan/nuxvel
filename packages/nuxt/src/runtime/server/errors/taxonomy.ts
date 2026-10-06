import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import type { ZodError } from "zod";
import type { ActionError } from "../actions/action-error";
import type { ForbiddenError } from "./forbidden-error";
import type { UnauthenticatedError } from "./unauthenticated-error";
import { type ValidationError, toValidationError } from "./validation";

/** The tRPC codes the error taxonomy uses, one per expected kind of failure. */
export type TaxonomyCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE_CONTENT"
  | "TOO_MANY_REQUESTS"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_SERVER_ERROR";

const TAXONOMY_ERROR = Symbol.for("nuxvel.taxonomy-error");

/**
 * Base class of every taxonomy error: a `TRPCError` with a fixed
 * {@link TaxonomyCode} and the matching HTTP `statusCode`.
 *
 * A taxonomy error keeps its message in production and is not reported
 * as unexpected, except an {@link UnknownError}. Thrown from a tRPC procedure it answers with its code;
 * thrown from a plain Nitro handler it answers with its `statusCode`,
 * its message and a `data` of `{ code, message }` (plus `fields` for a
 * {@link ValidationFailedError} or a single-column {@link ConflictError},
 * `requestId` for a {@link TransientError}).
 * Narrow one with {@link isTaxonomyError} rather than `instanceof`: it
 * also recognises an error from another copy of this module.
 */
export abstract class TaxonomyError extends TRPCError {
  declare readonly code: TaxonomyCode;
  readonly [TAXONOMY_ERROR] = true;

  constructor(code: TaxonomyCode, message?: string, options: { cause?: unknown } = {}) {
    super({ code, message, cause: options.cause });
  }

  /** The HTTP status this error answers with, e.g. 404 for `NOT_FOUND`. */
  get statusCode(): number {
    return getHTTPStatusCodeFromError(this);
  }
}

/**
 * Input failed its Zod schema. Surfaces as HTTP 400, with one message
 * list per invalid field in `fields` — sent to the client as
 * `data.fields`, where {@link useActionForm} reads it.
 *
 * {@link defineAction}, {@link defineJob}, {@link defineEvent} and
 * {@link Mail.send} throw it for input that fails their schema. A
 * foreign key that points at a missing row throws it with
 * `"does not exist"` on that column. Throw it
 * yourself after a `safeParse`; {@link toValidationError} builds the
 * same `{ code, message, fields }` shape without throwing.
 *
 * @example
 * ```ts
 * const result = createPostInput.safeParse(input);
 * if (!result.success) throw new ValidationFailedError(result.error);
 * ```
 */
export class ValidationFailedError extends TaxonomyError {
  declare readonly code: "BAD_REQUEST";
  readonly fields: ValidationError["fields"];

  constructor(zodError: ZodError) {
    const { message, fields } = toValidationError(zodError);
    super("BAD_REQUEST", message);
    this.fields = fields;
  }
}

/** The requested row does not exist. Surfaces as HTTP 404. */
export class NotFoundError extends TaxonomyError {
  declare readonly code: "NOT_FOUND";

  constructor(message?: string) {
    super("NOT_FOUND", message);
  }
}

/**
 * The write clashes with existing state. Surfaces as HTTP 409.
 *
 * nuxvel throws it for a unique violation, and for a delete of a row
 * that other rows still reference. A unique violation on a single
 * column carries that column's schema key
 * as `field`, which reaches the client as `data.fields` so
 * {@link useActionForm} shows it under the matching input.
 *
 * @param options.field - The input field the conflict belongs to.
 */
export class ConflictError extends TaxonomyError {
  declare readonly code: "CONFLICT";
  readonly field?: string;

  constructor(message?: string, options: { field?: string } = {}) {
    super("CONFLICT", message);
    this.field = options.field;
  }
}

/**
 * The caller is going too fast. Surfaces as HTTP 429.
 *
 * {@link rateLimiter}, {@link rateLimit} and an action's `rateLimit`
 * throw it with `retryAfter` set, and so does an upstream `429` that a
 * `$fetch` lets escape. From a procedure or a plain Nitro
 * handler it answers with a `Retry-After` header and `data.retryAfter`.
 *
 * @param options.retryAfter - Seconds until the caller may try again.
 */
export class RateLimitedError extends TaxonomyError {
  declare readonly code: "TOO_MANY_REQUESTS";
  readonly retryAfter?: number;

  constructor(message?: string, options: { retryAfter?: number } = {}) {
    super("TOO_MANY_REQUESTS", message);
    this.retryAfter = options.retryAfter;
  }
}

/**
 * A dependency is temporarily unavailable, and retrying may work.
 * Surfaces as HTTP 503.
 *
 * nuxvel throws it in place of a Postgres deadlock (`40P01`),
 * serialization failure (`40001`), lock timeout (`55P03`), cancelled
 * statement (`57014`) or lost connection, and in place of a `$fetch`
 * that gets no answer, a `408` or a `5xx`, when it escapes an action, a
 * procedure, a Nitro handler or a job. A job that throws it retries with its
 * backoff, and error tracking gets it only after the last attempt. From a
 * request it is logged at `warn` with its `cause`, and the client gets its
 * message and the request id.
 *
 * @param options.cause - The original error, logged but never sent to the client.
 */
export class TransientError extends TaxonomyError {
  declare readonly code: "SERVICE_UNAVAILABLE";

  constructor(message?: string, options: { cause?: unknown } = {}) {
    super("SERVICE_UNAVAILABLE", message, options);
  }
}

/**
 * An unclassified failure. Surfaces as HTTP 500. In production the client
 * gets "Something went wrong (ref: <request id>)", never its message; the
 * message is logged at `error`. Use {@link ActionError} through `fail()`
 * for a failure the user should read about.
 */
export class UnknownError extends TaxonomyError {
  declare readonly code: "INTERNAL_SERVER_ERROR";

  constructor(message?: string) {
    super("INTERNAL_SERVER_ERROR", message);
  }
}

interface TaxonomyErrorByCode {
  BAD_REQUEST: ValidationFailedError;
  UNAUTHORIZED: UnauthenticatedError;
  FORBIDDEN: ForbiddenError;
  NOT_FOUND: NotFoundError;
  CONFLICT: ConflictError;
  UNPROCESSABLE_CONTENT: ActionError;
  TOO_MANY_REQUESTS: RateLimitedError;
  SERVICE_UNAVAILABLE: TransientError;
  INTERNAL_SERVER_ERROR: UnknownError;
}

/**
 * Narrows an unknown error to the taxonomy error with a specific code —
 * `"CONFLICT"` to a {@link ConflictError}, `"BAD_REQUEST"` to a
 * {@link ValidationFailedError}, and so on. `code` is limited to
 * {@link TaxonomyCode}.
 *
 * @example
 * ```ts
 * if (isTaxonomyError(error, "NOT_FOUND")) return null;
 * ```
 */
export function isTaxonomyError<Code extends TaxonomyCode>(
  err: unknown,
  code: Code,
): err is TaxonomyErrorByCode[Code] {
  return isKnownTaxonomyError(err) && err.code === code;
}

/**
 * True when the error is one of the taxonomy classes. Errors outside the
 * taxonomy get their message stripped in production by
 * {@link errorFormatter}.
 */
export function isKnownTaxonomyError(err: unknown): err is TaxonomyError {
  return typeof err === "object" && err !== null && TAXONOMY_ERROR in err;
}
