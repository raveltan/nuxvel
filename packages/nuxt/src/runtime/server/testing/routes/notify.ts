import { defineEventHandler } from "h3";
import superjson from "superjson";
import { transaction } from "../../database/transaction";
import type { NotificationData, NotificationName } from "../../notifications/registry";
import { notify } from "../../notifications/notify";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { userIds, name, data } = await readSuperjsonBody<{
    userIds: string | string[];
    name: NotificationName;
    data: NotificationData<NotificationName>;
  }>(event);

  return superjson.serialize(await settle(() => transaction(() => notify(userIds, name, data))));
});
