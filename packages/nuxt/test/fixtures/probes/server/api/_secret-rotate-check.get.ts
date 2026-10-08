import { createHmac, randomBytes } from "node:crypto";
import { useSecrets } from "@nuxvel/nuxt/server/security";

const NAME = "NUXT_PROBE_SIGNING_SECRET";
const GRACE_MS = 24 * 60 * 60 * 1000;

function sign(secret: string) {
  return createHmac("sha256", secret).update("probe").digest("hex");
}

function signWithCurrent() {
  const [current] = useSecrets(NAME);

  return sign(current);
}

function unsetMessage() {
  try {
    useSecrets(NAME);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function verifies(signature: string) {
  return useSecrets(NAME).some((secret) => sign(secret) === signature);
}

export default defineEventHandler(() => {
  try {
    const whenUnset = unsetMessage();

    process.env[NAME] = randomBytes(32).toString("base64url");
    const oldSignature = signWithCurrent();

    process.env[`${NAME}_PREVIOUS`] = process.env[NAME];
    process.env[NAME] = randomBytes(32).toString("base64url");
    process.env[`${NAME}_PREVIOUS_EXPIRES_AT`] = new Date(
      Date.now() + GRACE_MS,
    ).toISOString();

    const freshSignature = signWithCurrent();
    const oldDuringGrace = verifies(oldSignature);
    const freshDuringGrace = verifies(freshSignature);

    process.env[`${NAME}_PREVIOUS_EXPIRES_AT`] = new Date(
      Date.now() - GRACE_MS,
    ).toISOString();

    return {
      whenUnset,
      freshSignedWithNewSecret: freshSignature !== oldSignature,
      oldDuringGrace,
      freshDuringGrace,
      oldAfterGrace: verifies(oldSignature),
      freshAfterGrace: verifies(freshSignature),
    };
  } finally {
    delete process.env[NAME];
    delete process.env[`${NAME}_PREVIOUS`];
    delete process.env[`${NAME}_PREVIOUS_EXPIRES_AT`];
  }
});
