import type { BetterAuthPlugin, User } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { sendMail } from "../mail/send-mail";
import { revokeApiKeys } from "./api-keys";
import { mailLocale } from "./mail-locale";
import type { SecurityChange } from "./mail/security-change";

const KNOWN_DEVICE_MAX_AGE = 400 * 24 * 60 * 60;
const KNOWN_USERS_PER_DEVICE = 10;
const NEW_DEVICE_SILENT_PATHS = ["/sign-up/email", "/verify-email"];
const TWO_FACTOR_PATHS = ["/two-factor/verify-totp", "/two-factor/disable"];

function notify(user: { email: string; name: string; locale?: string | null }, change: SecurityChange, device?: string) {
  return sendMail(
    "nuxvel.auth.security-notice",
    { to: user.email, name: user.name, change, ...(device ? { device } : {}) },
    { locale: mailLocale(user) },
  );
}

export async function noticeTwoFactorChange(user: User & { twoFactorEnabled?: boolean | null }, context: { path?: string } | null) {
  if (!context?.path || !TWO_FACTOR_PATHS.includes(context.path)) return;

  await notify(user, user.twoFactorEnabled ? "two-factor-on" : "two-factor-off");
}

export function securityNotices(): BetterAuthPlugin {
  return {
    id: "nuxvel-security-notices",
    hooks: {
      after: [
        {
          matcher: (context) => context.path === "/change-password",
          handler: createAuthMiddleware(async (ctx): Promise<void> => {
            const session = ctx.context.session;

            if (!session || ctx.context.returned instanceof APIError) return;

            const kept = ctx.context.newSession?.session.token ?? session.session.token;
            const others = (await ctx.context.internalAdapter.listSessions(session.user.id))
              .map(({ token }) => token)
              .filter((token) => token !== kept);

            if (others.length) await ctx.context.internalAdapter.deleteSessions(others);
            await revokeApiKeys(session.user.id);
            await notify(session.user, "password");
          }),
        },
        {
          matcher: (context) => context.path === "/change-email",
          handler: createAuthMiddleware(async (ctx): Promise<void> => {
            const user = ctx.context.session?.user;

            if (!user || user.emailVerified || ctx.context.returned instanceof APIError) return;

            await notify(user, "email");
          }),
        },
        {
          matcher: () => true,
          handler: createAuthMiddleware(async (ctx): Promise<void> => {
            const created = ctx.context.newSession;

            if (!created) return;

            const cookie = ctx.context.createAuthCookie("known_device", { maxAge: KNOWN_DEVICE_MAX_AGE });
            const known = ((await ctx.getSignedCookie(cookie.name, ctx.context.secret)) || "").split(",").filter(Boolean);

            if (known.includes(created.user.id)) return;

            if (!NEW_DEVICE_SILENT_PATHS.includes(ctx.path ?? "")) {
              await notify(created.user, "new-sign-in", created.session.userAgent ?? undefined);
            }

            const remembered = [created.user.id, ...known].slice(0, KNOWN_USERS_PER_DEVICE).join(",");
            await ctx.setSignedCookie(cookie.name, remembered, ctx.context.secret, cookie.attributes);
          }),
        },
      ],
    },
  };
}
