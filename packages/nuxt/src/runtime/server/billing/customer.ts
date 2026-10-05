import { eq } from "drizzle-orm";
import { useDb } from "../database/client";
import { useStripe } from "./use-stripe";
import { billingCustomersTable } from "./tables";

/** Who pays: a user with their ID and email address, such as the session user. */
export interface BillingUser {
  id: string;
  email: string;
}

export async function findBillingCustomer(userId: string) {
  const [customer] = await useDb({ root: true }).select().from(billingCustomersTable).where(eq(billingCustomersTable.userId, userId));

  return customer;
}

export async function billingCustomerFor(user: BillingUser) {
  const existing = await findBillingCustomer(user.id);

  if (existing) return existing;

  const created = await useStripe().customers.create(
    { email: user.email, metadata: { nuxvel_user: user.id } },
    { idempotencyKey: `customer:${user.id}` },
  );

  await useDb({ root: true })
    .insert(billingCustomersTable)
    .values({ userId: user.id, stripeCustomerId: created.id, livemode: created.livemode })
    .onConflictDoNothing({ target: billingCustomersTable.userId });

  const stored = await findBillingCustomer(user.id);

  if (!stored) throw new Error(`nuxvel: the billing customer of user ${user.id} was not stored`);

  return stored;
}
