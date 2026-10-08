import type { Actor } from "@nuxvel/nuxt/server/actions";
import { useAuth } from "@nuxvel/nuxt/server/auth";
import type { SessionUser } from "@nuxvel/nuxt/server/auth";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export async function useAuthIsTyped() {
  const { user, actor } = await useAuth();
  const userIsTyped: IsAny<typeof user> extends true ? never : true = true;
  const userIsOptional: Equals<typeof user, SessionUser | null> extends true ? true : never = true;
  const actorIsOptional: Equals<typeof actor, Actor | null> extends true ? true : never = true;
  // @ts-expect-error nobody may be signed in, so user needs a null check
  const id: string = user.id;

  return { userIsTyped, userIsOptional, actorIsOptional, id };
}
