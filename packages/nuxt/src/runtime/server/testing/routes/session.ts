import { makeSignature } from "better-auth/crypto";
import { defineEventHandler } from "h3";
import superjson from "superjson";
import { authInstance } from "../../auth/instance";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { sessionUser } from "../session-user";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { userId, twoFactorVerified } = await readSuperjsonBody<{ userId: string; twoFactorVerified?: boolean }>(event);
  const user = await sessionUser(userId);
  const context = await authInstance().$context;
  const session = await context.internalAdapter.createSession(user.id, false, { twoFactorVerified: twoFactorVerified ?? user.twoFactorEnabled }, true);
  const cookie = context.authCookies.sessionToken;

  return superjson.serialize({
    name: cookie.name,
    value: encodeURIComponent(`${session.token}.${await makeSignature(session.token, context.secret)}`),
  });
});
