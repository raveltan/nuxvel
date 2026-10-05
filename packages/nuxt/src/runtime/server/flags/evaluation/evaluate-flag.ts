import type { FlagSubject } from "../flag";
import type { FlagTargeting } from "../targeting";
import { bucketOf } from "./bucket";

export function evaluateFlag(
  name: string,
  fallback: boolean,
  targeting: FlagTargeting,
  subject: FlagSubject | undefined,
) {
  const roleValue = subject?.role ? targeting.roles?.[subject.role] : undefined;

  if (roleValue !== undefined) return roleValue;
  if (targeting.percentage === undefined) return fallback;
  if (targeting.percentage >= 100) return true;
  if (!subject) return false;

  return bucketOf(name, subject.id) < targeting.percentage;
}
