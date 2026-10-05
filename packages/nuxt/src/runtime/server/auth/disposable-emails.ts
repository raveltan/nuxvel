import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { isDisposableEmail } from "disposable-email-domains-js";

const CHECKED_FIELDS: Record<string, string> = { "/sign-up/email": "email", "/change-email": "newEmail" };

export function blockDisposableEmails(): BetterAuthPlugin {
  return {
    id: "nuxvel-disposable-emails",
    hooks: {
      before: [
        {
          matcher: (context) => context.path !== undefined && context.path in CHECKED_FIELDS,
          handler: createAuthMiddleware(async (ctx) => {
            const field = ctx.path ? CHECKED_FIELDS[ctx.path] : undefined;
            const email: unknown = field ? ctx.body?.[field] : undefined;

            if (typeof email === "string" && isDisposableEmail(email)) {
              throw APIError.from("BAD_REQUEST", {
                code: "DISPOSABLE_EMAIL",
                message: "Use an email address that is not a disposable one",
              });
            }
          }),
        },
      ],
    },
  };
}
