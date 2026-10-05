export default {
  whoami: authedProcedure.query(({ ctx }) => ctx.user.email),
  fresh: freshProcedure.query(({ ctx }) => ctx.user.email),
};
