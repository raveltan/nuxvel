/**
 * Where the tRPC handler is mounted, and where `$trpc` sends its requests.
 */
export const TRPC_PATH = "/api/trpc";

export function trpcEndpoint(baseURL: string) {
  return `${baseURL.replace(/\/$/, "")}${TRPC_PATH}`;
}
