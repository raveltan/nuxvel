import { getRequestHeader, getRequestHost, type H3Event } from "h3";
import { MaintenanceError } from "../../maintenance/maintenance-error";
import type { TRPCContext } from "../trpc";
import { BUILD_ID_HEADER } from "../../../shared/trpc/build-id-header";

export function createContext(event: H3Event): TRPCContext {
  const maintenance = event.context.nuxvelMaintenance;

  if (maintenance && !maintenance.admitted) throw new MaintenanceError(maintenance.message, maintenance.retryAfter);

  return {
    origin: getRequestHeader(event, "origin"),
    host: getRequestHost(event, { xForwardedHost: true }),
    clientBuildId: getRequestHeader(event, BUILD_ID_HEADER),
  };
}
