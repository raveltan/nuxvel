import { invalidatedBy } from "../actions/invalidation-scope";
import { currentEvent } from "../utils/current-event";
import { INVALIDATES_HEADER, invalidatesHeaderValue } from "../../shared/trpc/invalidates-header";

export function invalidatesHeader(): Record<string, string> {
  const tags = invalidatedBy(currentEvent());

  return tags ? { [INVALIDATES_HEADER]: invalidatesHeaderValue(tags) } : {};
}
