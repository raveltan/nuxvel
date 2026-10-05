import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { now } from "../clock/now";

const FRESH_SIGN_IN_MS = 10 * 60 * 1000;

export function signedInTooLongAgo(createdAt: Date) {
  return now().getTime() - createdAt.getTime() > FRESH_SIGN_IN_MS;
}

export function requireFreshEmailChange(): BetterAuthPlugin {
  return {
    id: "nuxvel-fresh-email-change",
    hooks: {
      before: [
        {
          matcher: (context) => context.path === "/change-email",
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx);

            if (session && signedInTooLongAgo(session.session.createdAt)) {
              throw APIError.from("FORBIDDEN", { code: "SESSION_NOT_FRESH", message: "Sign in again to continue" });
            }
          }),
        },
      ],
    },
  };
}
