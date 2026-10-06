import { eq } from "drizzle-orm";
import type { H3Event } from "h3";
import { actorContext } from "../actions/context";
import type { Actor } from "../actions/system-actor";
import { userActor } from "../actions/user-actor";
import { authenticateApiKey, requestApiKey, spendApiKey } from "../auth/api-keys";
import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";
import { auth, type SessionUser } from "./auth";
import { currentEvent } from "./current-event";

type Caller = { user: SessionUser; actor: Actor & { userId: string } } | null;

const callersByRequest = new WeakMap<H3Event, Promise<Caller>>();
const spentByRequest = new WeakSet<H3Event>();

async function findCaller(): Promise<Caller> {
  const apiKey = requestApiKey();

  if (apiKey) return authenticateApiKey(apiKey);

  const session = await auth();

  return session && { user: session.user, actor: userActor(session.user) };
}

function lookupCaller(event: H3Event): Promise<Caller> {
  let caller = callersByRequest.get(event);

  if (!caller) {
    caller = findCaller();
    callersByRequest.set(event, caller);
  }

  return caller;
}

export async function requestCaller(options: { spendPerCall?: boolean } = {}): Promise<Caller> {
  const event = currentEvent();

  if (!event) return null;

  const caller = await lookupCaller(event);

  if (caller?.actor.type === "api-key" && (options.spendPerCall || !spentByRequest.has(event))) {
    spentByRequest.add(event);
    await spendApiKey(caller.actor);
  }

  return caller;
}

export async function ambientActor(): Promise<Actor | null> {
  return actorContext.getStore() ?? (await requestCaller())?.actor ?? null;
}

async function findUser(id: string): Promise<SessionUser | null> {
  const session = currentEvent() ? await auth() : null;

  if (session?.user.id === id) return session.user;

  const users = schemaTable("user");
  const [user] = await useDb().select().from(users).where(eq(users.id, id));

  return user ?? null;
}

/**
 * The caller of the code that is running now, as `{ user, actor }`, each
 * `null` when nobody is signed in.
 *
 * Auto-imported on the server. It works without a `ctx`: in a procedure,
 * an action, an audited block, a seeder and a plain API handler. The
 * actor is the one the running action or procedure set, else the
 * request's API key or session. The user is the {@link SessionUser}
 * behind that actor: the session user, or a row loaded from the `user`
 * table. A {@link systemActor} has no user. A job sees the actor that
 * dispatched it, `null` when nobody did.
 *
 * @example
 * ```ts
 * export const archiveProjectAction = defineAction({
 *   input: z.object({ id: z.string() }),
 *   handler: async ({ id }) => {
 *     const { user } = await useAuth();
 *     await useDb().update(projectTable).set({ archivedBy: user?.id }).where(eq(projectTable.id, id));
 *   },
 * });
 * ```
 */
export async function useAuth(): Promise<{ user: SessionUser | null; actor: Actor | null }> {
  const actor = actorContext.getStore();

  if (!actor) return (await requestCaller()) ?? { user: null, actor: null };

  const userId = actor.type === "user" ? actor.id : actor.userId;

  return { user: userId ? await findUser(userId) : null, actor };
}
