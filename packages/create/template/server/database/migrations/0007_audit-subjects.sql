CREATE TABLE "audit_context" (
	"entry_id" integer PRIMARY KEY NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "audit_subjects" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text,
	CONSTRAINT "audit_subjects_user_id_unique" UNIQUE("user_id")
);
