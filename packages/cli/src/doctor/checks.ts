import { checkBotProtection } from "./check-bot-protection.ts";
import { checkDatabaseConnection } from "./check-database-connection.ts";
import { checkEnv } from "./check-env.ts";
import { checkHealthEndpoints } from "./check-health-endpoints.ts";
import { checkMaintenance } from "./check-maintenance.ts";
import { checkMailDns } from "./check-mail-dns.ts";
import { checkOffsiteBackups } from "./check-offsite-backups.ts";
import { checkOrphanedNames } from "./check-orphaned-names.ts";
import { checkPendingMigrations } from "./check-pending-migrations.ts";
import { checkRedisCache } from "./check-redis-cache.ts";
import { checkRestoreRehearsal } from "./check-restore-rehearsal.ts";
import { checkSecurityAdvisories } from "./check-security-advisories.ts";
import { checkSecurityHeaders } from "./check-security-headers.ts";
import { checkServerSentEvents } from "./check-server-sent-events.ts";
import type { DoctorCheck, UrlDoctorCheck } from "./doctor-check.ts";

export const doctorChecks: DoctorCheck[] = [
  checkEnv,
  checkDatabaseConnection,
  checkPendingMigrations,
  checkOrphanedNames,
  checkMaintenance,
  checkRedisCache,
  checkBotProtection,
  checkSecurityAdvisories,
  checkMailDns,
  checkOffsiteBackups,
  checkRestoreRehearsal,
];

export const urlDoctorChecks: UrlDoctorCheck[] = [checkSecurityHeaders, checkHealthEndpoints, checkServerSentEvents];
