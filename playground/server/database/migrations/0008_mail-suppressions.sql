CREATE TABLE "mail_suppressions" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"reason" text NOT NULL,
	"suppressed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mail_suppressions_address_unique" UNIQUE("address")
);
