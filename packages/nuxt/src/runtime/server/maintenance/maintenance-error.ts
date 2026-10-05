import { TransientError, isTaxonomyError } from "../errors/taxonomy";

export class MaintenanceError extends TransientError {
  readonly retryAfter: number;

  constructor(message: string, retryAfter: number) {
    super(message);
    this.retryAfter = retryAfter;
  }
}

export function isMaintenanceError(error: unknown): error is MaintenanceError {
  return isTaxonomyError(error, "SERVICE_UNAVAILABLE") && "retryAfter" in error;
}
