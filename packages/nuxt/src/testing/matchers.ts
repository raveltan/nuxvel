import type { TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { TRPC_ERROR_CODES_BY_KEY } from "@trpc/server/rpc";
import { expect } from "vitest";

interface ValidationErrorShape {
  code: string;
  fields: Record<string, string[]>;
}

function isValidationErrorShape(value: unknown): value is ValidationErrorShape {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "fields" in value &&
    typeof value.fields === "object"
  );
}

function unwrapFetchError(value: unknown): unknown {
  const data = value instanceof Error && "data" in value && value.data instanceof Object && "data" in value.data ? value.data.data : undefined;

  return isValidationErrorShape(data) ? data : value;
}

expect.extend({
  toHaveValidationErrors(received: unknown, ...expected: [Record<string, unknown>] | string[]) {
    received = unwrapFetchError(received);

    if (
      !isValidationErrorShape(received) ||
      !["VALIDATION_ERROR", "BAD_REQUEST", "CONFLICT", "UNPROCESSABLE_CONTENT"].includes(received.code)
    ) {
      return {
        pass: false,
        message: () =>
          `expected a ValidationFailedError or a VALIDATION_ERROR shape, got ${this.utils.stringify(received)}`,
      };
    }

    const actualFields = Object.keys(received.fields);

    if (actualFields.length === 0) {
      return {
        pass: false,
        message: () => "expected at least one validation error field, got none",
      };
    }

    const messages = typeof expected[0] === "object" ? expected[0] : undefined;
    const expectedFields = messages ? Object.keys(messages) : (expected as string[]);
    const missing = expectedFields.filter((field) => !actualFields.includes(field));

    if (missing.length > 0) {
      return {
        pass: false,
        message: () =>
          `expected validation errors on ${this.utils.stringify(expectedFields)}, missing ${this.utils.stringify(missing)}. Got fields: ${this.utils.stringify(actualFields)}`,
      };
    }

    if (messages) {
      const mismatched = Object.entries(messages).filter(([field, matcher]) => {
        const actual = received.fields[field] ?? [];

        return !actual.some((message) =>
          matcher instanceof RegExp
            ? matcher.test(message)
            : typeof matcher === "string"
              ? message === matcher
              : (matcher as { asymmetricMatch(other: unknown): boolean }).asymmetricMatch(message),
        );
      });

      if (mismatched.length > 0) {
        return {
          pass: false,
          message: () =>
            mismatched
              .map(
                ([field, matcher]) =>
                  `field ${field}: expected message ${this.utils.stringify(matcher)}, received ${this.utils.stringify(received.fields[field])}`,
              )
              .join("\n"),
        };
      }
    }

    return {
      pass: true,
      message: () =>
        `expected not to have validation errors on ${this.utils.stringify(actualFields)}`,
    };
  },
});

interface CodedErrorShape {
  code: string;
}

function isCodedErrorShape(value: unknown): value is CodedErrorShape {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string"
  );
}

interface ActionErrorShape {
  code: "UNPROCESSABLE_CONTENT";
  actionCode: string;
}

function isActionErrorShape(value: unknown): value is ActionErrorShape {
  return (
    isCodedErrorShape(value) &&
    value.code === "UNPROCESSABLE_CONTENT" &&
    "actionCode" in value &&
    typeof value.actionCode === "string"
  );
}

expect.extend({
  toBeActionError(received: unknown, expectedCode: string) {
    if (!isActionErrorShape(received)) {
      return {
        pass: false,
        message: () =>
          `expected an ActionError ({ code: "UNPROCESSABLE_CONTENT", actionCode }), got ${this.utils.stringify(received)}`,
      };
    }

    const pass = received.actionCode === expectedCode;

    return {
      pass,
      message: () =>
        pass
          ? `expected action error code not to be ${this.utils.stringify(expectedCode)}`
          : `expected action error code ${this.utils.stringify(expectedCode)}, got ${this.utils.stringify(received.actionCode)}`,
    };
  },
  toBeTrpcError(received: unknown, expectedCode: TRPC_ERROR_CODE_KEY) {
    if (!isCodedErrorShape(received) || !Object.hasOwn(TRPC_ERROR_CODES_BY_KEY, received.code)) {
      return {
        pass: false,
        message: () =>
          `expected a TRPCError ({ code } with a tRPC code), got ${this.utils.stringify(received)}`,
      };
    }

    const pass = received.code === expectedCode;

    return {
      pass,
      message: () =>
        pass
          ? `expected tRPC error code not to be ${this.utils.stringify(expectedCode)}`
          : `expected tRPC error code ${this.utils.stringify(expectedCode)}, got ${this.utils.stringify(received.code)}`,
    };
  },
});

function jobRetryable(received: unknown): boolean | undefined {
  if (typeof received !== "object" || received === null || !("retryable" in received)) return undefined;

  return typeof received.retryable === "boolean" ? received.retryable : undefined;
}

expect.extend({
  toBeUnrecoverable(received: unknown) {
    const retryable = jobRetryable(received);

    return {
      pass: retryable === false,
      message: () =>
        retryable === undefined
          ? `expected a runJob() rejection, got ${this.utils.stringify(received)}`
          : `expected the job error ${retryable ? "" : "not "}to fail without retry, got ${this.utils.stringify(received)}`,
    };
  },
  toBeRetryable(received: unknown) {
    const retryable = jobRetryable(received);

    return {
      pass: retryable === true,
      message: () =>
        retryable === undefined
          ? `expected a runJob() rejection, got ${this.utils.stringify(received)}`
          : `expected the job error ${retryable ? "not " : ""}to be retried, got ${this.utils.stringify(received)}`,
    };
  },
});

interface CustomMatchers<R = unknown> {
  /**
   * Passes for a `ValidationFailedError`, a `{ code, fields }` validation
   * error, a `ConflictError` or an action failure that has a `field` (from a procedure), or the ofetch `FetchError` of a REST 400, with messages on every
   * field named. Fields that you do not name are ignored.
   *
   * Pass field names, or one object that maps each field to the message it
   * must have: a string, a `RegExp` or an asymmetric matcher such as
   * `expect.any(String)`. A field passes when one of its messages matches.
   *
   * @example
   * ```ts
   * await expect(actingAs(user).trpc.post.create({ title: "" })).rejects.toHaveValidationErrors("title");
   * await expect(
   *   runAction("posts.create-post", { title: "" }, { actingAs: user }),
   * ).rejects.toHaveValidationErrors({ title: /required|too small/i });
   * await expect(
   *   actingAs(user).$fetch("/api/v1/posts", { method: "POST", body: { title: "" } }),
   * ).rejects.toHaveValidationErrors("title");
   * ```
   */
  toHaveValidationErrors(...fields: string[]): R;
  toHaveValidationErrors(messages: Record<string, string | RegExp | { asymmetricMatch(other: unknown): boolean }>): R;
  /**
   * Passes for an `ActionError` — an action's `fail()` — whose
   * `actionCode` is `expectedCode`. Any other error fails, including a
   * tRPC error with the same `code`. See {@link toBeTrpcError}.
   *
   * @example
   * ```ts
   * await expect(runAction("posts.update-post", input, { actingAs: user })).rejects.toBeActionError("post.body-empty");
   * ```
   */
  toBeActionError(expectedCode: string): R;
  /**
   * Passes for a `TRPCError` whose tRPC `code` is `expectedCode`, such as
   * a taxonomy error or what an in-process caller rejects with. An
   * action's `fail()` is `UNPROCESSABLE_CONTENT` here; match its
   * declared code with {@link toBeActionError}.
   *
   * @example
   * ```ts
   * await expect(guest().trpc.post.create(input)).rejects.toBeTrpcError("UNAUTHORIZED");
   * ```
   */
  toBeTrpcError(expectedCode: TRPC_ERROR_CODE_KEY): R;
  /**
   * Passes for a {@link runJob} rejection that `nuxvel queue:work` fails
   * at once, without a retry: a validation, auth, not found or conflict
   * error, an action's `fail()`, or BullMQ's `UnrecoverableError`. Any
   * other error fails it. See {@link toBeRetryable}.
   *
   * @example
   * ```ts
   * await expect(runJob("post.notify-followers", { postId: 0 })).rejects.toBeUnrecoverable();
   * ```
   */
  toBeUnrecoverable(): R;
  /**
   * Passes for a {@link runJob} rejection that `nuxvel queue:work`
   * retries with the job's backoff: a `TransientError`, a
   * `RateLimitedError`, or an error outside the taxonomy. Any other
   * error fails it. See {@link toBeUnrecoverable}.
   *
   * @example
   * ```ts
   * await expect(runJob("feed.sync", { url })).rejects.toBeRetryable();
   * ```
   */
  toBeRetryable(): R;
}

declare module "vitest" {
  interface Matchers<R, T = unknown> extends CustomMatchers<R> {}
}
