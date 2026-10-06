import { defineEventHandler } from "h3";
import superjson from "superjson";
import { transaction } from "../../database/transaction";
import { notify } from "../../notifications/notify";
import { findNotification } from "../../notifications/registry";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { settle } from "../settle";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { userIds, name, data } = await readSuperjsonBody<{ userIds: string | string[]; name: string; data: unknown }>(event);

  return superjson.serialize(
    await settle(() => {
      const notification = findNotification(name);

      if (!notification) throw new Error(`No notification is named "${name}"`);

      return transaction(() => notify(userIds, notification, data));
    }),
  );
});
