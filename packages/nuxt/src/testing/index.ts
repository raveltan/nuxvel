import "./matchers";

export { signIn, type SignInOptions } from "./sign-in";
export { expectEmitted, expectNoListenerRan, expectListenerQueued, expectListenerRan, expectNotEmitted } from "./fakes/events";
export { expectNoMailSent, expectMailSent } from "./fakes/mail";
export { expectFetched, expectNotFetched, fakeFetch } from "./fakes/fetch";
export type { FakeResponse, FetchedRequest } from "../runtime/server/testing/fetch-fake";
export { fakeStripe } from "./fakes/stripe";
export {
  type BillingTestUser,
  cancelSubscription,
  completeCheckout,
  disputePayment,
  expectNotPaid,
  expectNotSubscribed,
  expectPaid,
  expectSubscribed,
  failRenewal,
  type ProductRef,
  refundPayment,
  renewSubscription,
} from "./billing";
export type { StripeScenarioResult } from "../runtime/server/testing/stripe/scenario-result";
export type { FakePrice, FakeStripeOptions } from "../runtime/server/testing/stripe/state";
export { expectNotNotified, expectNotified } from "./fakes/notifications";
export { expectActionCalled } from "./fakes/actions";
export { expectBroadcast, expectNotBroadcast } from "./fakes/broadcasts";
export { expectCacheHit, expectCacheMiss } from "./fakes/cache";
export { expectErrorReported, expectNoErrorReported } from "./fakes/errors";
export { expectLogged } from "./fakes/logs";
export { expectPolicyChecked } from "./fakes/policies";
export { expectNoPushSent, expectPushSent, fakePush } from "./fakes/push";
export type { ListenerRun, ObservedActionCall, ObservedBroadcast, ObservedCacheLookup, ObservedError, ObservedLog, ObservedPolicyDecision, SentNotification } from "../runtime/server/observe/channels";
export type { DeliveredPush } from "../runtime/server/testing/recorders";
export { expectNotQueued, expectQueued, useRealQueue } from "./fakes/queue";
export { type ActingAsOptions, actingAs, type ApiKeyTestClient, guest, type SignedInTestClient, type TestCaller, type TestClient } from "./acting-as";
export type { ChannelListener, ChannelMessage, ListenEvent, ListenOptions } from "./listen";
export { expectRefused } from "./expect-refused";
export { type AuditRow, expectAudited, expectNotAudited } from "./expect-audited";
export { can } from "./can";
export { exhaustRateLimit } from "./exhaust-rate-limit";
export { expectCached } from "./expect-cached";
export { expectCount, expectNoRow, expectRow, expectSoftDeleted } from "./expect-row";
export { expectNotPresent, expectPresent } from "./expect-present";
export { runJob } from "./run-job";
export { workQueue } from "./work-queue";
export { deliverWebhook } from "./deliver-webhook";
export { expectNoWebhookSent, expectWebhookSent } from "./fakes/webhooks";
export { expectNotStored, expectStored, type StoredObject } from "./expect-stored";
export { runSchedule } from "./run-schedule";
export { type ListenerName, runListener } from "./run-listener";
export { type AccessibilityPage, expectAccessible, type ExpectAccessibleOptions } from "./expect-accessible";
export { captureQueries } from "./query-count";
export { expectConstantQueries } from "./expect-constant-queries";
export { expectQueryCount } from "./expect-query-count";
export { emit } from "./emit-event";
export { sendNotification } from "./send-notification";
export { renderMail } from "./render-mail";
export { runBackfill } from "./run-backfill";
export { runSeeder } from "./run-seeder";
export { runAction, type RunActionOptions } from "./run-action";
export { signedUrl } from "./signed-url";
export { totpCode } from "./totp-code";
export { disableFlag, enableFlag, setFlagTargeting } from "./set-flag-targeting";
export { forceVariant, startExperiment, stopExperiment } from "./experiments";
export { type MaintenanceOptions, startMaintenance, stopMaintenance } from "./maintenance";
export { freezeTime, travelBy, travelTo, type TravelDuration } from "./clock";
export type { LoginPage } from "./session";
export { visit, type VisitOptions } from "./visit";
export { fillForm } from "./fill-form";
export { getMeta, type PageMeta } from "./get-meta";
export { expect, type SpyAssertions } from "./expect";

/**
 * `describe` and `it` of Vitest, so one import line serves a test file:
 * `import { describe, expect, it } from "@nuxvel/nuxt/testing"`. Importing
 * them from `vitest` keeps working. Use {@link expect} from here too.
 *
 * @example
 * ```ts
 * import { describe, expect, it } from "@nuxvel/nuxt/testing";
 * ```
 */
export { describe, it } from "vitest";
export { trpcSpy, type TrpcSpy } from "./trpc-spy";
export { expectNoSmoke } from "./expect-no-smoke";
export { alert, button, cell, dialog, field, heading, link, type LocatorScope, type MatchOptions, menu, menuitem, text, toast, type ToastLocator } from "./locators";
