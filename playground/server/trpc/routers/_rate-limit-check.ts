export default {
  byKey: publicProcedure
    .use(
      rateLimit({
        points: 2,
        window: { minutes: 1 },
        by: ({ event }) => getHeader(event, "x-probe-key") ?? "none",
      }),
    )
    .query(() => "ok"),
  byUser: authedProcedure
    .use(rateLimit({ points: 1, window: { minutes: 1 }, by: "user" }))
    .query(({ ctx }) => ctx.user.id),
  sharedByUser: authedProcedure
    .use(rateLimit({ limit: "_shared-probe", by: "user" }))
    .query(({ ctx }) => ctx.user.id),
};
