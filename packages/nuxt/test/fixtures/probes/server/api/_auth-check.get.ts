import { UnauthenticatedError } from "@nuxvel/nuxt/server/api";
import { requireAuth, useAuth } from "@nuxvel/nuxt/server/auth";

export default defineEventHandler(async () => {
  const { user } = await useAuth();

  if (!user) {
    let threwUnauthenticated = false;

    try {
      await requireAuth();
    } catch (e) {
      threwUnauthenticated = e instanceof UnauthenticatedError;
    }

    return { user: null, threwUnauthenticated };
  }

  const required = await requireAuth();

  return {
    user,
    requiredMatchesSession: required.user.id === user.id,
  };
});
