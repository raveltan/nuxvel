-- drizzle-kit cannot express PARTITION BY: the snapshot tracks the columns and composite key, this file does the rest by hand.
ALTER TABLE "audit_log" RENAME TO "audit_log_unpartitioned";--> statement-breakpoint
ALTER TABLE "audit_log_unpartitioned" RENAME CONSTRAINT "audit_log_id_occurred_at_pk" TO "audit_log_unpartitioned_pk";--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" integer DEFAULT nextval('audit_log_id_seq'::regclass) NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"changes" jsonb,
	"metadata" jsonb,
	"request_id" text,
	"prev_hash" text,
	"hash" text NOT NULL,
	CONSTRAINT "audit_log_id_occurred_at_pk" PRIMARY KEY("id","occurred_at")
) PARTITION BY RANGE ("occurred_at");--> statement-breakpoint
ALTER SEQUENCE "audit_log_id_seq" OWNED BY "audit_log"."id";--> statement-breakpoint
DO $$
DECLARE
	month_start timestamp := date_trunc('month', now() AT TIME ZONE 'UTC');
	last_month timestamp := date_trunc('month', now() AT TIME ZONE 'UTC') + interval '3 months';
BEGIN
	WHILE month_start <= last_month LOOP
		EXECUTE format(
			'CREATE TABLE %I PARTITION OF "audit_log" FOR VALUES FROM (%L) TO (%L)',
			'audit_log_y' || to_char(month_start, 'YYYY') || 'm' || to_char(month_start, 'MM'),
			month_start,
			month_start + interval '1 month'
		);
		month_start := month_start + interval '1 month';
	END LOOP;
END $$;--> statement-breakpoint
DROP TABLE "audit_log_unpartitioned";
