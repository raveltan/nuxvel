/**
 * How a locator helper matches a name, a label or a text.
 *
 * @param exact - `true` (the default) matches the whole string, with case.
 *   `false` matches a part of it, without case. A `RegExp` ignores it.
 */
export type MatchOptions = { exact?: boolean };
