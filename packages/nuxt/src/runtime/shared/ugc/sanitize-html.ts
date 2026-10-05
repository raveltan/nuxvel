import sanitize from "sanitize-html";

declare const sanitized: unique symbol;

/**
 * An HTML string that went through {@link sanitizeHtml}. A plain `string`
 * is not assignable to it, so `<SafeHtml>` refuses HTML nobody cleaned.
 *
 * Auto-imported as a type on the server and in the app. Type a stored
 * column with it (`text("body").$type<SanitizedHtml>()`) so the value
 * keeps the type from the database to the component.
 */
export type SanitizedHtml = string & { readonly [sanitized]: true };

/** Which tags {@link sanitizeHtml} keeps. */
export type SanitizeProfile = "basic" | "rich";

const BASIC_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "s", "code", "a", "ul", "ol", "li", "blockquote"];
const RICH_TAGS = [...BASIC_TAGS, "h2", "h3", "h4", "pre", "hr"];
const LINK_REL = "nofollow ugc noopener";

/**
 * Removes every tag, attribute and URL scheme that is not on a strict
 * allowlist from an HTML string.
 *
 * Auto-imported on the server. The `"basic"` profile keeps paragraphs,
 * line breaks, inline marks (`strong`, `b`, `em`, `i`, `u`, `s`, `code`),
 * links, lists and quotes. `"rich"` adds `h2`–`h4`, `pre` and `hr`. Links
 * keep only an `http:`, `https:` or `mailto:` `href`, and always get
 * `rel="nofollow ugc noopener"`. `<script>` and `<style>` go with their
 * content, and every event handler attribute goes. Other tags are
 * dropped and their text kept. Use {@link richText} to sanitize a form
 * field while it is validated.
 *
 * @param options.profile The allowlist to apply. Defaults to `"basic"`.
 *
 * @example
 * ```ts
 * const body = sanitizeHtml(importedPost.html, { profile: "rich" });
 * ```
 */
export function sanitizeHtml(html: string, options: { profile?: SanitizeProfile } = {}): SanitizedHtml {
  // a brand has no runtime value, so the cleaned string is the branded one
  return sanitize(html, {
    allowedTags: options.profile === "rich" ? RICH_TAGS : BASIC_TAGS,
    allowedAttributes: { a: ["href", "rel"] },
    transformTags: { a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: LINK_REL } }) },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
  }) as SanitizedHtml;
}
