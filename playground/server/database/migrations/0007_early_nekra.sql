CREATE TABLE "outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"payload" jsonb,
	"dispatched_at" timestamp
);
