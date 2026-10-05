import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";

const TARGET = "/api/_signed-url-target?invite=42";
const GRACE_MS = 24 * 60 * 60 * 1000;

async function outcome(url: string) {
  const response = await $fetch.raw(url, { ignoreResponseError: true });

  return response.status === 200 ? response._data : `${response.status} ${response.statusText}`;
}

function check(path: string) {
  try {
    requireSignature(path);
    return "valid";
  } catch (error) {
    if (error instanceof TRPCError) return `${error.code} ${error.message}`;
    throw error;
  }
}

export default defineEventHandler(async () => {
  const previousSecret = process.env.NUXT_AUTH_SECRET;
  const valid = signedUrl(TARGET, { expiresIn: 60 });

  try {
    const results = {
      valid: await outcome(valid),
      tampered: await outcome(valid.replace("invite=42", "invite=43")),
      unsigned: await outcome(TARGET),
      expired: await outcome(signedUrl(TARGET, { expiresIn: -1 })),
      path: { valid: check(valid), tampered: check(valid.replace("invite=42", "invite=43")), expired: check(signedUrl(TARGET, { expiresIn: -1 })),
        dotSegments: check(valid.replace("/api/_signed-url-target", "/api/other/../_signed-url-target")),
        encodedDots: check(valid.replace("/api/_signed-url-target", "/api/other/%2e%2e/_signed-url-target")),
        backslash: check(valid.replace("/api/_signed-url-target", "/api/other\\..\\_signed-url-target")),
      },
      rotatedDuringGrace: null as unknown,
      rotatedAfterGrace: null as unknown,
    };

    process.env.NUXT_AUTH_SECRET = randomBytes(32).toString("base64url");
    process.env.NUXT_AUTH_SECRET_PREVIOUS = previousSecret;
    process.env.NUXT_AUTH_SECRET_PREVIOUS_EXPIRES_AT = new Date(Date.now() + GRACE_MS).toISOString();
    results.rotatedDuringGrace = await outcome(valid);

    process.env.NUXT_AUTH_SECRET_PREVIOUS_EXPIRES_AT = new Date(Date.now() - GRACE_MS).toISOString();
    results.rotatedAfterGrace = await outcome(valid);

    return results;
  } finally {
    process.env.NUXT_AUTH_SECRET = previousSecret;
    delete process.env.NUXT_AUTH_SECRET_PREVIOUS;
    delete process.env.NUXT_AUTH_SECRET_PREVIOUS_EXPIRES_AT;
  }
});
