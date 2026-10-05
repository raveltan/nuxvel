export default {
  authed: authedProcedure.query(({ ctx }) => {
    useLogger("logger-check").info("logger-check authed");
    return ctx.user.id;
  }),
};
