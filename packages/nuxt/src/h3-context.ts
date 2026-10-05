/**
 * Builds the `H3EventContext` augmentation for the fields nuxvel's
 * request-logging plugin and its maintenance middleware set on a request.
 */
export function buildH3ContextTypes() {
  return `declare module "h3" {
  interface H3EventContext {
    nuxvelRequestStartedAt?: number;
    nuxvelRequestId?: string;
    nuxvelActor?: string;
    nuxvelMaintenance?: { message: string; retryAfter: number; admitted: boolean };
  }
}

export {};
`;
}
