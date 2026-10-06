import type { H3Event } from "h3";
import { useEvent } from "nitropack/runtime";
import { userActor } from "../actions/user-actor";
import { verifyingAuthInstances } from "../auth/instance";
import { UnauthenticatedError } from "../errors/unauthenticated-error";
import { rememberActor } from "../logging/log-context";

export async function findSession(headers: Headers, query?: { disableRefresh: boolean }) {
  for (const instance of verifyingAuthInstances()) {
    const session = await instance.api.getSession({ headers, query });

    if (session) return session;
  }

  return null;
}

const sessionsByRequest = new WeakMap<H3Event, ReturnType<typeof findSession>>();

/**
 * The signed-in user as the session carries it: Better Auth's user
 * fields plus `role`. What `ctx.user` is inside an
 * {@link authedProcedure}.
 */
export type SessionUser = NonNullable<Awaited<ReturnType<typeof auth>>>["user"];

export function auth() {
  const event = useEvent();
  let session = sessionsByRequest.get(event);

  if (!session) {
    session = findSession(event.headers).then((found) => {
      if (found) rememberActor(event, userActor(found.user));
      return found;
    });
    sessionsByRequest.set(event, session);
  }

  return session;
}

/**
 * The session for the current request, throwing
 * {@link UnauthenticatedError} when there is none.
 *
 * Auto-imported on the server. The session is looked up once per
 * request: every later call in the same request, {@link useAuth} and
 * {@link authedProcedure} included, reuses that lookup. A session signed
 * with a previous secret is still accepted while that secret is inside
 * the grace period `nuxvel key:rotate` gave it. Use {@link useAuth} to
 * read the user without requiring one. The error answers with HTTP 401 — tRPC
 * `UNAUTHORIZED` from a procedure, where {@link authedProcedure} is the
 * shorter way to require a session.
 */
export async function requireAuth() {
  const session = await auth();

  if (!session) throw new UnauthenticatedError();

  return session;
}
