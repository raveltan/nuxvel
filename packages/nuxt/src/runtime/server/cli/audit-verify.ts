import { writeFile } from "node:fs/promises";
import { verifyAuditChain } from "../audit/verify-audit-chain";
import type { AuditVerification } from "./audit-verification";

export async function runAuditVerify(outFile: string): Promise<number> {
  const { checked, firstBreak } = await verifyAuditChain();
  const verification: AuditVerification = { intact: !firstBreak, checked, firstBreak: firstBreak ?? null };

  await writeFile(outFile, JSON.stringify(verification));

  return 0;
}
