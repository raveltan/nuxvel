import { defineEventHandler } from "h3";
import superjson from "superjson";
import { TRPCError } from "@trpc/server";
import { errorFields } from "../../trpc/error-extras";
import { createContext } from "../../trpc/request/create-context";
import { reportUnexpectedError } from "../../trpc/report-unexpected-error";
import { appRouter } from "../../trpc/router";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { sessionUser } from "../session-user";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

interface CallRequest {
  userId?: string;
  path: string;
  input: unknown;
}

function procedureAt(caller: object, path: string) {
  if (!(path in appRouter._def.procedures)) throw new Error(`No tRPC procedure at "${path}"`);

  let target: unknown = caller;

  for (const key of path.split(".")) {
    if ((typeof target !== "object" && typeof target !== "function") || target === null) break;
    target = Reflect.get(target, key);
  }

  if (typeof target !== "function") throw new Error(`No tRPC procedure at "${path}"`);

  return target;
}

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { userId, path, input } = await readSuperjsonBody<CallRequest>(event);

  const settled = await settle(async () => {
    const user = userId ? await sessionUser(userId) : undefined;
    const caller = appRouter.createCaller({ ...createContext(event), user }, { onError: reportUnexpectedError });

    try {
      return await procedureAt(caller, path)(input);
    } catch (error) {
      const fields = error instanceof TRPCError ? errorFields(error) : undefined;
      if (fields) Object.assign(error as TRPCError, { fields });
      throw error;
    }
  });

  return superjson.serialize(settled);
});
