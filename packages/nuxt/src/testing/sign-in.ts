import { fetch } from "@nuxt/test-utils/e2e";
import { type SignedInTestClient, sessionClient } from "./acting-as";
import { withSessionCookie } from "./session";

/** Options for {@link signIn}. */
export interface SignInOptions {
  /**
   * Headers that the sign-in request and each later `trpc`, `fetch` and
   * `$fetch` call send, for example `x-forwarded-for` to sign in from an
   * IP or `user-agent` to name the device of the session. A header that a
   * `fetch` or `$fetch` call gives itself wins. `visit` and `login` do not
   * send them.
   */
  headers?: HeadersInit;
}

/**
 * Signs a user in through the real Better Auth endpoint `/api/auth/sign-in/email`
 * and returns a {@link SignedInTestClient} on that session.
 *
 * Use it to test the sign-in itself or what depends on a real session.
 * For all other tests, {@link actingAs} is faster. Throws when the app
 * refuses the password. Throws also when the user has two-factor sign-in
 * on, because the sign-in then starts no session. The user needs a
 * password, for example from `userFactory.withPassword(password)`.
 *
 * @param options.headers Headers to send with the sign-in and with each later call, see {@link SignInOptions}.
 *
 * @example
 * ```ts
 * const author = await userFactory.withPassword("secret-password")();
 * const { trpc } = await signIn(author.email, "secret-password");
 * await trpc.post.create({ title: "Hello", body: "" });
 * const phone = await signIn(author.email, "secret-password", { headers: { "user-agent": "Phone" } });
 * ```
 */
export async function signIn(email: string, password: string, options: SignInOptions = {}): Promise<SignedInTestClient> {
  const headers = new Headers(options.headers);

  headers.set("content-type", "application/json");

  const response = await fetch("/api/auth/sign-in/email", {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) throw new Error(`signIn: the app refused ${email} with ${response.status}: ${await response.text()}`);

  const pair = response.headers
    .getSetCookie()
    .map((candidate) => candidate.split(";")[0] ?? "")
    .find((candidate) => candidate.includes("session_token=") && !candidate.endsWith("="));

  if (!pair) {
    throw new Error(`signIn: ${email} has two-factor sign-in on, so the sign-in starts no session. Use actingAs(user) instead.`);
  }

  const separator = pair.indexOf("=");
  const cookie = { name: pair.slice(0, separator), value: pair.slice(separator + 1) };
  const session = async () => cookie;

  return sessionClient(session, undefined, () => withSessionCookie(options.headers, session), options.headers);
}
