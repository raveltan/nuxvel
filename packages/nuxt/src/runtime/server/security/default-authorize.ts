export function defaultAuthorize(isPublic: boolean | undefined) {
  return isPublic ? () => true : ({ user }: { user: unknown }) => user !== null;
}
