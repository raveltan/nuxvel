import { defineEventHandler } from "h3";
import superjson from "superjson";
import discoveredPolicies from "#nuxvel/policies";
import { userActor } from "../../actions/user-actor";
import { canByName } from "../../policies/can";
import type { Policy } from "../../policies/define-policy";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { sessionUser } from "../session-user";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

interface CanRequest {
  userId: string;
  action: string;
  tableName: string;
  row: Record<string, unknown>;
}

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { userId, action, tableName, row } = await readSuperjsonBody<CanRequest>(event);

  return superjson.serialize(
    await settle(async () => {
      const registered: readonly Policy[] = discoveredPolicies;
      const policy = registered.find((candidate) => candidate.tableName === tableName);
      if (!policy) throw new Error(`No policy covers table "${tableName}"`);

      return canByName(userActor(await sessionUser(userId)), action, policy.table, row);
    }),
  );
});
