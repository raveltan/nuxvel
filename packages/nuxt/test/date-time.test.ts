import { expect, guest, visit } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { createPage, url } from "@nuxt/test-utils/e2e";
import { setupPlayground } from "./helpers/playground";

const SERVER_TIMEZONE = "America/New_York";
const BROWSER_TIMEZONE = "Australia/Sydney";

function renderedTime(html: string) {
  return html.match(/<time[^>]*>([^<]*)<\/time>/)?.[1];
}

async function openInBrowser(path: string) {
  const page = await createPage(undefined, { timezoneId: BROWSER_TIMEZONE });
  const errors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(url(path), { waitUntil: "hydration" });

  return { page, errors };
}

describe("<DateTime> under a non-UTC timezone", async () => {
  await setupPlayground({
    browser: true,
    env: { TZ: SERVER_TIMEZONE },
  });

  it("detects the mismatch a naive toLocaleString() causes", async () => {
    const { page, errors } = await openInBrowser("/_date-time-naive");

    expect(errors).toContainEqual(expect.stringMatching(/hydration/i));

    await page.close();
  });

  it("hydrates a first visit in UTC without a mismatch, then shows the browser's timezone", async () => {
    expect(renderedTime(await guest().$fetch<string>("/_date-time"))).toBe(
      "Jan 15, 2026, 11:30 PM",
    );

    const page = await visit("/_date-time", { timezoneId: BROWSER_TIMEZONE });

    await page.waitForFunction(
      () => document.querySelector("time")?.textContent === "Jan 16, 2026, 10:30 AM",
    );

    const cookie = (await page.context().cookies()).find(
      ({ name }) => name === "nuxvel-timezone",
    );

    expect(decodeURIComponent(cookie?.value ?? "")).toBe(BROWSER_TIMEZONE);
  });

  it("server-renders a return visit in the stored timezone, matching the hydrated DOM", async () => {
    const cookie = {
      name: "nuxvel-timezone",
      value: encodeURIComponent(BROWSER_TIMEZONE),
    };
    const html = await guest().$fetch<string>("/_date-time", {
      headers: { cookie: `${cookie.name}=${cookie.value}` },
    });

    expect(renderedTime(html)).toBe("Jan 16, 2026, 10:30 AM");

    const page = await visit("/_date-time", {
      timezoneId: BROWSER_TIMEZONE,
      storageState: {
        cookies: [{ ...cookie, domain: new URL(url("/")).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }],
        origins: [],
      },
    });

    expect(await page.textContent("time")).toBe("Jan 16, 2026, 10:30 AM");
  });
});
