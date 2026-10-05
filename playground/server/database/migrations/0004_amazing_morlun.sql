CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"changes" jsonb,
	"metadata" jsonb,
	"request_id" text
);
