import { z } from "zod";

const query = z.object({ to: z.email() });

export default defineEventHandler(async (event) => {
  const { to } = query.parse(getQuery(event));

  await sendMailNow("nuxvel.auth.security-notice", {
    to,
    name: "Ada",
    change: "email",
    device: "Firefox on macOS",
    url: "https://nuxvel.test/api/auth/approve",
  });

  return { sent: true };
});
