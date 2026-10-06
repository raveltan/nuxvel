import { getCookie, setCookie, type H3Event } from "h3";
import {
  FLASH_COOKIE,
  parseFlashMessages,
  type FlashMessage,
  type FlashType,
} from "../../shared/flash/flash-message";
import { currentEvent } from "../utils/current-event";

const flashesByRequest = new WeakMap<H3Event, FlashMessage[]>();

/**
 * Stores a message for the next page load only, like Laravel's session
 * flash. With Nuxt UI, the next page shows it as a toast. With
 * `nuxvel.ui: false`, read it with {@link useFlash}.
 *
 * Auto-imported on the server. Call it from an action, a tRPC mutation
 * or an event handler while a request runs. Outside a request (a job, a
 * schedule, a CLI command) it does nothing. The message travels in a
 * short-lived `nuxvel-flash` cookie on the response, so it shows whether
 * the next page renders on the server or through a client-side
 * `navigateTo()`.
 *
 * @param options.type - The kind of message: `"success"` (the default),
 * `"error"`, `"info"` or `"warning"`.
 *
 * @example
 * ```ts
 * create: authedProcedure.input(createPostInput).mutation(async ({ input }) => {
 *   const post = await createPostAction(input);
 *   flash("Post created");
 *   return post;
 * }),
 * ```
 */
export function flash(message: string, options: { type?: FlashType } = {}) {
  const event = currentEvent();

  if (!event) return;

  const flashes =
    flashesByRequest.get(event) ?? parseFlashMessages(getCookie(event, FLASH_COOKIE));
  flashes.push({ message, type: options.type ?? "success" });
  flashesByRequest.set(event, flashes);
  setCookie(event, FLASH_COOKIE, JSON.stringify(flashes), {
    path: "/",
    sameSite: "lax",
    maxAge: 60,
  });
}
