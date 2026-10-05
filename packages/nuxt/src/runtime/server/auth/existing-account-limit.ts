import { createHash } from "node:crypto";
import { consumeAttempt } from "../security/sliding-window";

const ONE_HOUR_IN_SECONDS = 60 * 60;

export async function mayMailExistingAccount(email: string) {
  const address = createHash("sha256").update(email.toLowerCase()).digest("hex");

  return (await consumeAttempt(`auth:existing-account:${address}`, 1, ONE_HOUR_IN_SECONDS)).allowed;
}
