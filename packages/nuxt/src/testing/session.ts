import { url } from "@nuxt/test-utils/e2e";
import { callControlChannel } from "./control-channel";

/**
 * The part of a Playwright `Page` that `actingAs(user).login(page)` uses,
 * so the testing entry does not need `playwright-core` installed to
 * typecheck.
 */
export interface LoginPage {
  context(): {
    addCookies(cookies: { name: string; value: string; domain: string; path: string; secure: boolean }[]): Promise<void>;
  };
}

export interface SessionCookie {
  name: string;
  value: string;
}

export type Session = () => Promise<SessionCookie>;

export function sessionOf(user: { id: string }, twoFactorVerified?: boolean): Session {
  let cookie: Promise<SessionCookie> | undefined;

  return () => (cookie ??= callControlChannel<SessionCookie>("session", { userId: user.id, twoFactorVerified }));
}

export async function addSessionCookie(page: LoginPage, session: Session): Promise<void> {
  const cookie = await session();

  await page.context().addCookies([{ ...cookie, domain: new URL(url("/")).hostname, path: "/", secure: true }]);
}

export async function withSessionCookie(headers: HeadersInit | undefined, session: Session): Promise<Headers> {
  const { name, value } = await session();
  const signed = new Headers(headers);

  signed.set("cookie", `${name}=${value}`);

  return signed;
}
