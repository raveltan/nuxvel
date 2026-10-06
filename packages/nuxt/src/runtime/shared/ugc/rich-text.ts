import { z } from "zod";
import { richTextMarker } from "./rich-text-schemas";
import { type SanitizeProfile, sanitizeHtml } from "./sanitize-html";

/**
 * A Zod schema for an HTML field that users write: it checks the length,
 * then parses to the {@link sanitizeHtml} output.
 *
 * Auto-imported on the server, in the app and in `shared/`. The parsed
 * value is a {@link SanitizedHtml}, so what an action stores is already
 * safe to render with `<SafeHtml>`. Input longer than `max` fails with a
 * Zod `too_big` issue. Scripts, event handlers and links that are not
 * `http:`, `https:` or `mailto:` are removed, not reported.
 *
 * @param options.max The longest accepted input, in characters, before
 * sanitizing. Defaults to 10 000.
 * @param options.profile The {@link sanitizeHtml} allowlist. Defaults to
 * `"basic"`.
 *
 * @example
 * ```ts
 * // shared/schemas/post.ts
 * export const createPostInput = z.object({
 *   title: z.string().min(1),
 *   body: richText({ max: 20_000, profile: "rich" }),
 * });
 * ```
 */
export function richText(options: { max?: number; profile?: SanitizeProfile } = {}) {
  const schema = z
    .string()
    .max(options.max ?? 10_000)
    .transform((html) => sanitizeHtml(html, { profile: options.profile }));
  return Object.assign(schema, { [richTextMarker]: true });
}
