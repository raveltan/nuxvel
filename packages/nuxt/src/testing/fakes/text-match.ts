export type TextMatch = string | RegExp;

export function textMatches(match: TextMatch | undefined, text: string) {
  if (match === undefined) return true;

  return typeof match === "string" ? text.includes(match) : match.test(text);
}
