import type { SignedInTestClient } from "@nuxvel/nuxt/testing";

export async function sessionCookie(client: SignedInTestClient) {
  let cookie = "";

  await client.login({
    context: () => ({
      addCookies: async ([added]) => {
        cookie = added ? `${added.name}=${added.value}` : "";
      },
    }),
  });

  return cookie;
}
