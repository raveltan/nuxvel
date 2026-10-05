/**
 * Builds `#nuxvel/error-handlers`: the Nitro error handlers registered
 * before nuxvel's, which nuxvel's own handler runs in order.
 */
export function buildErrorHandlersModuleCode(handlers: string[]) {
  return [
    ...handlers.map((path, index) => `import errorHandler${index} from ${JSON.stringify(path)};`),
    `export default [${handlers.map((_, index) => `errorHandler${index}`).join(", ")}];`,
    "",
  ].join("\n");
}

/** Builds the declaration of `#nuxvel/error-handlers`. */
export function buildErrorHandlersTypes() {
  return `declare module "#nuxvel/error-handlers" {
  import type { NitroErrorHandler } from "nitropack/types";

  const errorHandlers: NitroErrorHandler[];
  export default errorHandlers;
}
`;
}
