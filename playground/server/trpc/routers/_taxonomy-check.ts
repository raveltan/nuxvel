import { z } from "zod";

const errorsByName = {
  NotFoundError,
  ForbiddenError,
  UnauthenticatedError,
  ConflictError,
  RateLimitedError,
  TransientError,
  UnknownError,
};

export default {
  throwError: publicProcedure
    .input(z.enum(Object.keys(errorsByName) as (keyof typeof errorsByName)[]))
    .query(({ input }) => {
      throw new errorsByName[input]("taxonomy check");
    }),
};
