type IsAny<T> = 0 extends 1 & T ? true : false;

export const authedContext = authedProcedure.query(({ ctx }) => {
  const userIsTyped: IsAny<typeof ctx.user> extends true ? never : true = true;
  const actorIsTyped: IsAny<typeof ctx.actor> extends true ? never : true = true;
  const role: string = ctx.user.role;
  const actorRole: string | undefined = ctx.actor.role;

  return { userIsTyped, actorIsTyped, role, actorRole };
});

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export const publicContext = publicProcedure.query(({ ctx }) => {
  const userIsOptional: Equals<typeof ctx.user, SessionUser | null> extends true ? true : never = true;
  const actorIsOptional: Equals<typeof ctx.actor, Actor | null> extends true ? true : never = true;
  // @ts-expect-error a public procedure may have no user, so ctx.user needs a null check
  const id: string = ctx.user.id;

  return { userIsOptional, actorIsOptional, id };
});
