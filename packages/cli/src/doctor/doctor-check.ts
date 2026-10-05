export type DoctorStatus = "failed" | "warning" | "passed" | "skipped";

export interface DoctorFinding {
  status: DoctorStatus;
  detail: string;
  hint?: string;
}

export interface DoctorCheck {
  name: string;
  run(context: { cwd: string }): Promise<DoctorFinding[]>;
}

export interface UrlDoctorCheck {
  name: string;
  run(context: { cwd: string; url: string }): Promise<DoctorFinding[]>;
}

export const passed = (detail: string): DoctorFinding => ({ status: "passed", detail });

export const skipped = (detail: string): DoctorFinding => ({ status: "skipped", detail: `skipped, ${detail}` });

export const failed = (detail: string, hint?: string): DoctorFinding => ({ status: "failed", detail, hint });

export const warning = (detail: string, hint?: string): DoctorFinding => ({ status: "warning", detail, hint });
