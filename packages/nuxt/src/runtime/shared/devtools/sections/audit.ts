export type AuditSectionData = {
  id: number;
  occurredAt: string;
  actorType: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
}[];
