import { defineEventHandler } from "h3";
import superjson from "superjson";
import { issueApiKey } from "../../auth/api-keys";
import { refuseOutsideVitest } from "../refuse-outside-vitest";
import { sessionUser } from "../session-user";
import { readSuperjsonBody } from "../read-superjson-body";

export default defineEventHandler(async (event) => {
  refuseOutsideVitest();

  const { userId } = await readSuperjsonBody<{ userId: string }>(event);
  const user = await sessionUser(userId);
  const { key } = await issueApiKey(user.id, { name: "actingAs" });

  return superjson.serialize({ key });
});
