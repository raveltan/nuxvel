import { z } from "zod";
import { ConflictError, ForbiddenError, NotFoundError, RateLimitedError, TransientError, UnauthenticatedError, UnknownError, publicProcedure } from "@nuxvel/nuxt/server/api";

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
