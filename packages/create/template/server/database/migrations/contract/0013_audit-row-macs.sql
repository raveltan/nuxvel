ALTER TABLE "audit_subjects" ADD CONSTRAINT "audit_subjects_mac_present" CHECK ("mac" IS NOT NULL) NOT VALID;
--> statement-breakpoint
ALTER TABLE "audit_context" ADD CONSTRAINT "audit_context_mac_present" CHECK ("mac" IS NOT NULL) NOT VALID;
