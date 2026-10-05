export default defineEventHandler(async () => {
  const session = await auth();

  if (!session) {
    let threwUnauthenticated = false;

    try {
      await requireAuth();
    } catch (e) {
      threwUnauthenticated = e instanceof UnauthenticatedError;
    }

    return { session: null, threwUnauthenticated };
  }

  const required = await requireAuth();

  return {
    session,
    requiredMatchesSession: required.user.id === session.user.id,
  };
});
