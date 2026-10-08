import {
  actingAs,
  can,
  emit,
  enableFlag,
  exhaustRateLimit,
  expect,
  forceVariant,
  expectAudited,
  expectActionCalled,
  expectBroadcast,
  expectQueued,
  expectErrorReported,
  expectLogged,
  expectEmitted,
  expectNoMailSent,
  expectMailSent,
  expectNotQueued,
  expectNotNotified,
  expectNotified,
  expectPolicyChecked,
  expectPresent,
  expectRow,
  expectSoftDeleted,
  guest,
  renderMail,
  runAction,
  runBackfill,
  runJob,
  runListener,
  runSchedule,
  runSeeder,
  sendNotification,
  setFlagTargeting,
  startExperiment,
  stopExperiment,
} from "@nuxvel/nuxt/testing";
import { defineFactory } from "@nuxvel/nuxt/factories";
import { pgTable, serial, text, uuid } from "drizzle-orm/pg-core";
import { belongsTo } from "@nuxvel/nuxt/database";
import * as testNamespaces from "#build/nuxvel/test-namespaces.mjs";
import { postsTable } from "~~/server/database/schema/posts.schema";
import { postFactory } from "~~/server/factories/posts.factory";
import { userFactory } from "~~/server/factories/users.factory";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { userTable } from "~~/server/database/schema/auth.schema";
import { postsChannel } from "#server/channels/posts.channel";
import _probePublicChannel from "#server/channels/_probe-public";
import postsSeeder from "#server/seeders/_probe/posts";
import { loginRateLimit } from "#server/rate-limits/login.rate-limit";
import _probeNamesBackfill from "#server/database/backfills/_probe-names";
import { namedExportJob } from "#server/jobs/_probe/named-export.job";
import recordJob from "#server/jobs/_probe/record";
import { welcomeMail } from "#server/mail/welcome.mail";
import { welcomeNotification } from "#server/notifications/welcome.notification";
import { databaseSeeder } from "#server/seeders/database.seeder";

export async function fakeAssertionsTakeOnlyDefinedNames() {
  await expectQueued("_probe.record", { name: "typed" });
  await expectQueued("_probe.record", { name: "typed" });
  await expectMailSent("welcome", { to: "ada@example.com" });
  await expectEmitted("_probe.happened", { name: "typed" });

  // @ts-expect-error no job is named probe.missing
  await expectQueued("probe.missing");
  // @ts-expect-error no mail is named goodbye
  await expectMailSent("goodbye");
  // @ts-expect-error no event is named probe.missing
  await expectEmitted("probe.missing");
}

export async function positiveAssertionsReturnTheRecord() {
  const queued = await expectQueued("_probe.record", { name: "typed" });
  const nameIsTyped: IsAny<typeof queued.name> extends true ? never : true = true;

  return nameIsTyped;
}

export async function expectSoftDeletedTakesOnlySoftDeletableTables() {
  const row = await expectSoftDeleted(postsTable, { id: 1 });
  const rowIsTyped: IsAny<typeof row.id> extends true ? never : true = true;

  // @ts-expect-error health_checks has no deletedAt
  await expectSoftDeleted(healthChecksTable, {});

  return rowIsTyped;
}

export async function policyAndActionAssertionsAreTyped() {
  const decision = await expectPolicyChecked("update", postsTable);
  const call = await expectActionCalled("posts.update-post");
  const decisionIsTyped: IsAny<typeof decision.allowed> extends true ? never : true = true;
  const callIsTyped: IsAny<typeof call.ok> extends true ? never : true = true;

  // @ts-expect-error posts has no fly rule
  await expectPolicyChecked("fly", postsTable);
  // @ts-expect-error no action is named posts.missing
  await expectActionCalled("posts.missing");

  return [decisionIsTyped, callIsTyped];
}

export async function errorAndLogAssertionsAreTyped() {
  const error = await expectErrorReported("boom");
  const line = await expectLogged("warn", /boom/);
  const errorIsTyped: IsAny<typeof error.message> extends true ? never : true = true;
  const lineIsTyped: IsAny<typeof line.message> extends true ? never : true = true;

  // @ts-expect-error fine is not a log level
  await expectLogged("fine", "boom");

  return [errorIsTyped, lineIsTyped];
}

export async function broadcastAssertionTakesOnlyDeclaredEvents() {
  const broadcast = await expectBroadcast("_probe-public", "from-job", { title: "typed" });
  const broadcastIsTyped: IsAny<typeof broadcast.channel> extends true ? never : true = true;

  // @ts-expect-error _probe-public declares no event named missing
  await expectBroadcast("_probe-public", "missing");

  await expectBroadcast("_probe-board", "moved", { card: 1 }, { params: { boardId: 1 } });

  // @ts-expect-error _probe-board names the param boardId
  await expectBroadcast("_probe-board", "moved", {}, { params: { roomId: 1 } });

  return broadcastIsTyped;
}

export async function runJobTakesOnlyDefinedJobs() {
  await runJob("_probe.record", { name: "typed" });

  // @ts-expect-error no job is named probe.missing
  await runJob("probe.missing", {});
  // @ts-expect-error _probe.record needs its name
  await runJob("_probe.record", {});
}

export async function runScheduleTakesOnlyDefinedSchedules() {
  await runSchedule("_probe.tick");

  // @ts-expect-error no schedule is named probe.missing
  await runSchedule("probe.missing");
}

export async function jobFixturesTakeADefinition() {
  await runJob(recordJob, { name: "typed" });
  await expectQueued(recordJob, { name: "typed" }, { times: 1 });
  await expectNotQueued(recordJob);
  await expectQueued(namedExportJob, { name: "typed" });
  await expectNotQueued(namedExportJob);

  // @ts-expect-error the definition's input takes a string name
  await runJob(recordJob, { name: 1 });
  // @ts-expect-error the definition's input takes a string name
  await expectQueued(recordJob, { name: 1 });
  // @ts-expect-error the definition's input takes a string name
  await expectNotQueued(namedExportJob, { name: 1 });
}

type IsAny<T> = 0 extends 1 & T ? true : false;
type TestJobStub = typeof recordJob;
type TestFlagStub = typeof testNamespaces.$flags;

export const testJobStubIsTheDefinition: IsAny<TestJobStub> extends true ? never : TestJobStub extends typeof recordJob ? true : never = true;
export const testFlagStubsAreTyped: IsAny<TestFlagStub> extends true ? never : true = true;

export async function jobFixturesTakeATestStub() {
  await runJob(recordJob, { name: "typed" });
  await expectQueued(namedExportJob, { name: "typed" });

  // @ts-expect-error the definition's input takes a string name
  await runJob(recordJob, { name: 1 });
}

export async function mailFixturesTakeADefinitionOrATestStub() {
  await renderMail(welcomeMail, { to: "ada@example.com", name: "Ada" });
  await expectMailSent(welcomeMail, { to: "ada@example.com" });
  await expectMailSent(welcomeMail, { name: "Ada" });
  await expectNoMailSent(welcomeMail);

  const sent: { to: string; name: string } = await expectMailSent("welcome");
  const sentByDefinition: { to: string; name: string } = await expectMailSent(welcomeMail);
  void [sent, sentByDefinition];

  // @ts-expect-error the definition's input needs a name
  await renderMail(welcomeMail, { to: "ada@example.com" });
  // @ts-expect-error the definition's name is a string
  await expectMailSent(welcomeMail, { name: 1 });
}

export async function notificationFixturesTakeADefinitionOrATestStub() {
  await sendNotification({ id: "user-1" }, welcomeNotification, { name: "Ada" });
  await sendNotification([{ id: "user-1" }], welcomeNotification, { name: "Ada" });
  await expectNotified({ id: "user-1" }, welcomeNotification, { title: "Welcome, Ada" });
  await expectNotNotified({ id: "user-1" }, welcomeNotification);

  // @ts-expect-error the definition's data needs a name
  await sendNotification({ id: "user-1" }, welcomeNotification, {});
  // @ts-expect-error the definition's name is a string
  await sendNotification({ id: "user-1" }, welcomeNotification, { name: 1 });
}

export async function expectPresentTakesADefinitionOrATestStub() {
  const member = await expectPresent(postsChannel, { id: 1 }, { id: "user-1" });
  const typing: boolean | undefined = member.state.typing;
  await expectPresent(postsChannel, { id: 1 }, { id: "user-1" });

  // @ts-expect-error _probe-public sets no presence
  await expectPresent(_probePublicChannel, {}, { id: "user-1" });

  return typing;
}

export async function runListenerTakesOnlyDefinedListeners() {
  await runListener("_record-probe-queued", { name: "typed" });

  // @ts-expect-error no listener is named probe.missing
  await runListener("probe.missing", {});
}

export function matchersAreRegistered(error: unknown) {
  expect(error).toBeTrpcError("NOT_FOUND");

  // @ts-expect-error an action's declared code is not a tRPC code
  expect(error).toBeTrpcError("post.body-empty");
}

const ticketsTable = pgTable("tickets", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull(),
  assigneeId: text("assignee_id").references(() => userTable.id),
});
const teamsTable = pgTable("teams", { id: uuid("id").primaryKey() });
const membershipsTable = pgTable("memberships", {
  id: serial("id").primaryKey(),
  userId: belongsTo(userTable),
  teamId: belongsTo(teamsTable, { nullable: true }),
  ticketId: belongsTo(ticketsTable),
});
type MembershipRow = typeof membershipsTable.$inferSelect;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

export const belongsToFollowsTheIdType: IsAny<MembershipRow["userId"]> extends true ? never : Same<MembershipRow["userId"], (typeof userTable.$inferSelect)["id"]> = true;
export const belongsToNullableIsNullable: Same<MembershipRow["teamId"], string | null> = true;
export const belongsToSerialIsANumber: Same<MembershipRow["ticketId"], number> = true;

const ticketFactory = defineFactory(ticketsTable);

export async function factoriesReturnSelectRows() {
  const author = await userFactory();
  const post = await postFactory.for("authorId", author)();

  const postId: number = post.id;
  const postIdIsTyped: IsAny<typeof post.id> extends true ? never : true = true;

  // @ts-expect-error authorId holds a user id, a string
  postFactory.for("authorId", { id: postId });
  // @ts-expect-error posts has no column named ownerId
  postFactory.for("ownerId", author);
  ticketFactory.for("assigneeId", author);
  const byRelation = await postFactory({ author });
  const byRelationIsTyped: IsAny<typeof byRelation.authorId> extends true ? never : true = true;
  // @ts-expect-error author is a user, whose id is a string
  postFactory({ author: { id: postId } });
  // @ts-expect-error posts has no column named writerId
  postFactory({ writer: author });
  // @ts-expect-error a state takes the table's columns
  postFactory.state({ archived: true });

  const trashed = await postFactory.trashed()();
  const deletedAt: Date | null = trashed.deletedAt;
  // @ts-expect-error user has no softDeletes() column, so its factory has no trashed()
  userFactory.trashed();

  return { postId, postIdIsTyped, deletedAt, byRelationIsTyped };
}

export async function callersAreTypedByTheRouter() {
  const { api } = actingAs({ id: "typed" });
  const callerIsTyped: IsAny<typeof api> extends true ? never : true = true;
  const listed = await guest().api.post.list();
  const listedIsTyped: IsAny<typeof listed> extends true ? never : true = true;

  // @ts-expect-error the post router has no procedure named missing
  await api.post.missing();
  // @ts-expect-error post.create needs a title
  await api.post.create({ body: "" });

  return { callerIsTyped, listedIsTyped };
}

export async function fetchIsTypedByTheRoute() {
  const inbox = await actingAs({ id: "typed" }).$fetch("/api/notifications");
  const inboxIsTyped: IsAny<typeof inbox> extends true ? never : true = true;
  const unread: number = inbox.unreadCount;
  const guestInbox = await guest().$fetch("/api/notifications");
  const guestInboxIsTyped: IsAny<typeof guestInbox> extends true ? never : true = true;

  return { inboxIsTyped, unread, guestInboxIsTyped };
}

export async function rowAssertionsAreTypedByTheTable() {
  const post = await expectRow(postsTable, { title: "Hello" });
  const postTitle: string = post.title;
  const audited = await expectAudited("post.updated", { targetType: "posts" });
  const auditedTarget: string = audited.targetId;

  // @ts-expect-error posts has no column named headline
  await expectRow(postsTable, { headline: "Hello" });
  // @ts-expect-error a post's title is a string
  await expectRow(postsTable, { title: 1 });
  // @ts-expect-error audit_log has no column named target
  await expectAudited("post.updated", { target: "posts" });

  return { postTitle, auditedTarget };
}

export async function appFixturesTakeOnlyDefinedNames() {
  const { html }: { html: string } = await renderMail("welcome", { to: "ada@example.com", name: "Ada" });
  await emit("_probe.happened", { name: "typed", count: 1 });
  await runBackfill("_probe-names");

  // @ts-expect-error no mail is named goodbye
  await renderMail("goodbye", { to: "ada@example.com" });
  // @ts-expect-error welcome needs a recipient
  await renderMail("welcome", { name: "Ada" });
  // @ts-expect-error no event is named probe.missing
  await emit("probe.missing", {});
  // @ts-expect-error _probe.happened's count is a number
  await emit("_probe.happened", { name: "typed", count: "1" });
  // @ts-expect-error no backfill is named missing
  await runBackfill("missing");

  return html;
}

export async function runActionIsTypedByTheAction(author: { id: string }) {
  const post = await runAction("posts.create-post", { title: "Hi", body: "" }, { actingAs: author });
  const postId: number = post.id;

  // @ts-expect-error no action is named posts.publish-post
  await runAction("posts.publish-post", {}, { actingAs: author });
  // @ts-expect-error posts.create-post needs a title
  await runAction("posts.create-post", { body: "" }, { actingAs: author });
  // @ts-expect-error an action runs as a user
  await runAction("posts.create-post", { title: "Hi", body: "" });
  await runAction("posts.create-post", { title: "Hi", body: "" }, { asSystem: "import" });
  // @ts-expect-error an action runs as a user or as a system actor, not both
  await runAction("posts.create-post", { title: "Hi", body: "" }, { actingAs: author, asSystem: "import" });

  return postId;
}

export async function flagFixturesTakeADefinitionOrATestStub() {
  await setFlagTargeting(testNamespaces.$flags.probeRollout, { percentage: 100 });
  await setFlagTargeting($flags.probeRollout, { percentage: 100 });
  await startExperiment(testNamespaces.$experiments.probeCta);
  await stopExperiment($experiments.probeCta);

  // @ts-expect-error probe-cta is an experiment, not a flag
  await setFlagTargeting(testNamespaces.$experiments.probeCta, { percentage: 100 });
  // @ts-expect-error probe-rollout is a flag, not an experiment
  await startExperiment(testNamespaces.$flags.probeRollout);
}

export async function backfillAndSeederFixturesTakeADefinitionOrATestStub() {
  await runBackfill(_probeNamesBackfill);
  await runSeeder(postsSeeder);
  await runSeeder(databaseSeeder);

  // @ts-expect-error a seeder is not a backfill
  await runBackfill(databaseSeeder);
  // @ts-expect-error a rate limit is not a seeder
  await runSeeder(loginRateLimit);
}

export async function flagFixturesTakeOnlyDefinedNames() {
  await setFlagTargeting("probe-rollout", { percentage: 100, roles: { "beta-tester": true } });
  await startExperiment("probe-cta");
  await stopExperiment("probe-cta");

  // @ts-expect-error no flag is named probe-missing
  await setFlagTargeting("probe-missing", { percentage: 100 });
  // @ts-expect-error probe-cta is an experiment, not a flag
  await setFlagTargeting("probe-cta", { percentage: 100 });
  // @ts-expect-error a percentage is a number
  await setFlagTargeting("probe-rollout", { percentage: "100" });
  // @ts-expect-error no experiment is named probe-missing
  await startExperiment("probe-missing");
  // @ts-expect-error probe-rollout is a flag, not an experiment
  await stopExperiment("probe-rollout");
}

export async function enableFlagTakesOnlyDefinedFlags() {
  await enableFlag("probe-rollout");

  // @ts-expect-error no flag is named probe.missing
  await enableFlag("probe.missing");
}

export async function forceVariantTakesOnlyDefinedVariants() {
  await forceVariant("probe-cta", "green");

  // @ts-expect-error probe-cta has no variant named red
  await forceVariant("probe-cta", "red");
}

declare const policyProbeUser: { id: string };
declare const policyProbePost: typeof postsTable.$inferSelect;

export async function canTakesOnlyDefinedRules() {
  await can(policyProbeUser, "update", postsTable, policyProbePost);

  // @ts-expect-error posts has no rule named publish
  await can(policyProbeUser, "publish", postsTable, policyProbePost);
}

export async function exhaustRateLimitTakesOnlyDefinedLimits() {
  await exhaustRateLimit("login", { ip: "127.0.0.1" });
  await exhaustRateLimit("login", "ip:127.0.0.1");
  await exhaustRateLimit(guest().api._rateLimitCheck.byKey);

  // @ts-expect-error a shared limit needs the identity
  await exhaustRateLimit("login");

  // @ts-expect-error no rate limit is named probe.missing
  await exhaustRateLimit("probe.missing", { ip: "127.0.0.1" });
}

export async function listenerNextTakesTheEventsOfTheChannel() {
  const stream = await guest().listen("posts?id=1");

  await stream.next("created");
  await stream.next("presence.join");
  await stream.next();

  // @ts-expect-error posts declares no deleted event
  await stream.next("deleted");

  const unknown = await guest().listen("_no-such-channel");

  await unknown.next("anything");
}
