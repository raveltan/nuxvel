CREATE TABLE "backfills" (
	"name" text PRIMARY KEY NOT NULL,
	"cursor" jsonb,
	"processed" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
