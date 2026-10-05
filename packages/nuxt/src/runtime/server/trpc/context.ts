import { currentEvent } from "../utils/current-event";

/**
 * The id of the request currently being handled, or `undefined` outside
 * one (a job, a schedule, a CLI command). It is the id the request log
 * line carries — from a well-formed `x-request-id` header, or generated —
 * and it is attached to action traces, audit rows and reported errors,
 * so a single request can be followed end to end. Auto-imported on the
 * server; available in any handler, procedure, action or
 * {@link useCaller} call made during the request.
 */
export function currentRequestId(): string | undefined {
  return currentEvent()?.context.nuxvelRequestId;
}
