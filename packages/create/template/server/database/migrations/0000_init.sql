CREATE TABLE "audit_log" (
	"id" serial NOT NULL,
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
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backfills" (
	"name" text PRIMARY KEY NOT NULL,
	"cursor" jsonb,
	"processed" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flag_conversions" (
	"name" text NOT NULL,
	"unit_id" text NOT NULL,
	"metric" text NOT NULL,
	"converted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "flag_conversions_name_unit_id_metric_pk" PRIMARY KEY("name","unit_id","metric")
);
--> statement-breakpoint
CREATE TABLE "flag_exposures" (
	"name" text NOT NULL,
	"unit_id" text NOT NULL,
	"variant" text NOT NULL,
	"exposed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "flag_exposures_name_unit_id_variant_pk" PRIMARY KEY("name","unit_id","variant")
);
--> statement-breakpoint
CREATE TABLE "mail_suppressions" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"reason" text NOT NULL,
	"suppressed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mail_suppressions_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"payload" jsonb,
	"dispatched_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;