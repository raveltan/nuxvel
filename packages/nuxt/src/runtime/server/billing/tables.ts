import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { now } from "../clock/now";

/**
 * The Stripe customer of each user, one per user, which nuxvel's
 * billing creates on the user's first checkout. Re-export it from the
 * app's `server/database/schema/billing.schema.ts`.
 */
export const billingCustomersTable = pgTable("billing_customers", {
  userId: text("user_id").primaryKey(),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  livemode: boolean("livemode").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow().$defaultFn(now),
});

/**
 * Every Stripe event that the Stripe webhook received, by its Stripe
 * ID, so a repeated delivery is stored once and processed once. It keeps
 * the ID of the object the event is about, not the object, which the
 * processing job fetches again from Stripe. Re-export it from the app's
 * `server/database/schema/billing.schema.ts`.
 */
export const billingEventsTable = pgTable(
  "billing_events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    objectId: text("object_id"),
    livemode: boolean("livemode").notNull(),
    stripeCreatedAt: timestamp("stripe_created_at").notNull(),
    receivedAt: timestamp("received_at").notNull().defaultNow().$defaultFn(now),
    processedAt: timestamp("processed_at"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
  },
  (table) => [index("billing_events_processed_at_idx").on(table.processedAt)],
);

/**
 * A copy of each subscription of a user as Stripe last reported it.
 * Stripe stays the source of truth. Re-export it from the app's
 * `server/database/schema/billing.schema.ts`.
 */
export const billingSubscriptionsTable = pgTable(
  "billing_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    product: text("product").notNull(),
    priceId: text("price_id").notNull(),
    status: text("status").notNull(),
    quantity: integer("quantity").notNull().default(1),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    endedAt: timestamp("ended_at"),
    livemode: boolean("livemode").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow().$defaultFn(now),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$defaultFn(now),
  },
  (table) => [index("billing_subscriptions_user_id_idx").on(table.userId)],
);

/**
 * Each one-time payment of a user: its amount in the currency's
 * smallest unit, and whether it was refunded or disputed. Payment rows
 * stay when the user is erased, for accounting. Re-export it from the
 * app's `server/database/schema/billing.schema.ts`.
 */
export const billingPaymentsTable = pgTable(
  "billing_payments",
  {
    checkoutSessionId: text("checkout_session_id").primaryKey(),
    paymentIntentId: text("payment_intent_id").notNull().unique(),
    userId: text("user_id").notNull(),
    product: text("product").notNull(),
    priceId: text("price_id").notNull(),
    amount: integer("amount").notNull(),
    amountRefunded: integer("amount_refunded").notNull().default(0),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    livemode: boolean("livemode").notNull(),
    paidAt: timestamp("paid_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow().$defaultFn(now),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$defaultFn(now),
  },
  (table) => [index("billing_payments_user_id_idx").on(table.userId)],
);
