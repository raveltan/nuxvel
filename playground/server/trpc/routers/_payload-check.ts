export default {
  large: publicProcedure.query(() => "x".repeat(150_000)),
};
