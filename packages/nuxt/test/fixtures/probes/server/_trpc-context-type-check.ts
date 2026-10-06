type IsAny<T> = 0 extends 1 & T ? true : false;

export const authedContext = authedProcedure.query(({ ctx }) => {
  const userIsTyped: IsAny<typeof ctx.user> extends true ? never : true = true;
  const actorIsTyped: IsAny<typeof ctx.actor> extends true ? never : true = true;
  const role: string = ctx.user.role;
  const actorRole: string | undefined = ctx.actor.role;
  const actorUserIdIsString: Equals<typeof ctx.actor.userId, string> extends true ? true : never = true;

  return { userIsTyped, actorIsTyped, role, actorRole, actorUserIdIsString };
});

export const roleContext = roleProcedure(["admin"]).query(({ ctx }) => {
  const actorUserIdIsString: Equals<typeof ctx.actor.userId, string> extends true ? true : never = true;

  return { actorUserIdIsString };
});

export const userActorHasUserId: Equals<ReturnType<typeof userActor>["userId"], string> extends true ? true : never = true;
export const apiKeyActorHasUserId: Equals<ReturnType<typeof apiKeyActor>["userId"], string> extends true ? true : never = true;
export const systemActorMayHaveNoUserId: Equals<ReturnType<typeof systemActor>["userId"], string | undefined> extends true ? true : never = true;

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export const publicContext = publicProcedure.query(({ ctx }) => {
  const userIsOptional: Equals<typeof ctx.user, SessionUser | null> extends true ? true : never = true;
  const actorIsOptional: Equals<typeof ctx.actor, (Actor & { userId: string }) | null> extends true ? true : never = true;
  // @ts-expect-error a public procedure may have no user, so ctx.user needs a null check
  const id: string = ctx.user.id;

  return { userIsOptional, actorIsOptional, id };
});
