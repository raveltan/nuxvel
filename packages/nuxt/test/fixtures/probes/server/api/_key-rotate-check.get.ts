import { randomBytes, randomUUID } from "node:crypto";

const GRACE_MS = 24 * 60 * 60 * 1000;

async function sessionExists(cookie: string) {
  const { session } = await $fetch<{ session: unknown }>("/api/_auth-check", {
    headers: { cookie },
  });

  return session !== null;
}

async function signIn() {
  const email = `key-rotate-${randomUUID()}@example.com`;
  const password = "correct-horse-battery-staple";

  await $fetch("/api/auth/sign-up/email", {
    method: "POST",
    body: { name: "Rotate User", email, password },
  });

  const response = await $fetch.raw("/api/auth/sign-in/email", {
    method: "POST",
    body: { email, password },
  });

  const setCookie = response.headers
    .getSetCookie()
    .find((value) => value.includes("session_token"));

  return setCookie?.split(";")[0] ?? "";
}

export default defineEventHandler(async (event) => {
  const oldCookie = getHeader(event, "cookie") ?? "";
  const previousSecret = process.env.NUXT_AUTH_SECRET;

  try {
    process.env.NUXT_AUTH_SECRET = randomBytes(32).toString("base64url");
    process.env.NUXT_AUTH_SECRET_PREVIOUS = previousSecret;
    process.env.NUXT_AUTH_SECRET_PREVIOUS_EXPIRES_AT = new Date(
      Date.now() + GRACE_MS,
    ).toISOString();

    const oldDuringGrace = await sessionExists(oldCookie);
    const freshCookie = await signIn();
    const freshDuringGrace = await sessionExists(freshCookie);

    process.env.NUXT_AUTH_SECRET_PREVIOUS_EXPIRES_AT = new Date(
      Date.now() - GRACE_MS,
    ).toISOString();

    const oldAfterGrace = await sessionExists(oldCookie);
    const freshAfterGrace = await sessionExists(freshCookie);

    return {
      oldDuringGrace,
      freshDuringGrace,
      oldAfterGrace,
      freshAfterGrace,
    };
  } finally {
    process.env.NUXT_AUTH_SECRET = previousSecret;
    delete process.env.NUXT_AUTH_SECRET_PREVIOUS;
    delete process.env.NUXT_AUTH_SECRET_PREVIOUS_EXPIRES_AT;
  }
});
