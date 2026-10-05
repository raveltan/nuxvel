ALTER TABLE "health_checks" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "health_checks" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;