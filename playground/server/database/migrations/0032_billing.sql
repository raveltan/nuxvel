CREATE TABLE "billing_customers" (
	"user_id" text PRIMARY KEY NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"livemode" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_customers_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"object_id" text,
	"livemode" boolean NOT NULL,
	"stripe_created_at" timestamp NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "billing_payments" (
	"checkout_session_id" text PRIMARY KEY NOT NULL,
	"payment_intent_id" text NOT NULL,
	"user_id" text NOT NULL,
	"product" text NOT NULL,
	"price_id" text NOT NULL,
	"amount" integer NOT NULL,
	"amount_refunded" integer DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"livemode" boolean NOT NULL,
	"paid_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billing_payments_payment_intent_id_unique" UNIQUE("payment_intent_id")
);
--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product" text NOT NULL,
	"price_id" text NOT NULL,
	"status" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"ended_at" timestamp,
	"livemode" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "billing_events_processed_at_idx" ON "billing_events" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "billing_payments_user_id_idx" ON "billing_payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_user_id_idx" ON "billing_subscriptions" USING btree ("user_id");