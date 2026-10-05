import {
  emit,
  expectEmitted,
  expectNotEmitted,
  expectListenerQueued,
  expectListenerRan,
  expectNoMailSent,
  expectMailSent,
  expectNotNotified,
  expectNotified,
  sendNotification,
  expectNotQueued,
  expectQueued,
} from "@nuxvel/nuxt/testing";
import type { SocialProvider } from "../../src/runtime/app/auth/social-provider";

await expectQueued("_probe.record", { name: "Ada" });
await expectNotQueued("_probe.record");
await expectListenerRan("record-view");
await expectListenerQueued("notify-subscribers");

// @ts-expect-error no event is named probe.missing
await expectNotEmitted("probe.missing");

// @ts-expect-error no job is named probe.missing
await expectQueued("probe.missing");
// @ts-expect-error _probe.record's name is a string
await expectQueued("_probe.record", { name: 1 });
// @ts-expect-error no job is named probe.missing
await expectNotQueued("probe.missing");
// @ts-expect-error _probe.record's name is a string
await expectNotQueued("_probe.record", { name: 1 });

await expectMailSent("welcome", { to: "ada@example.com", name: "Ada" });
await expectNoMailSent("welcome");

// @ts-expect-error no mail is named goodbye
await expectMailSent("goodbye");
// @ts-expect-error welcome's name is a string
await expectMailSent("welcome", { name: 1 });
// @ts-expect-error no mail is named goodbye
await expectNoMailSent("goodbye");

await expectNotified({ id: "user-1" }, "welcome", { title: "Welcome, Ada" });
await expectNotNotified({ id: "user-1" }, "welcome");

// @ts-expect-error no notification is named goodbye
await expectNotified({ id: "user-1" }, "goodbye");
// @ts-expect-error a notification's title is a string
await expectNotified({ id: "user-1" }, "welcome", { title: 1 });
// @ts-expect-error no notification is named goodbye
await expectNotNotified({ id: "user-1" }, "goodbye");

await sendNotification({ id: "user-1" }, "welcome", { name: "Ada" });
// @ts-expect-error a bare id is not a user
await expectNotified("user-1", "welcome");
// @ts-expect-error welcome's name is a string
await sendNotification({ id: "user-1" }, "welcome", { name: 1 });

await expectEmitted("_probe.happened", { name: "Ada" });

// @ts-expect-error no event is named probe.missing
await expectEmitted("probe.missing");
// @ts-expect-error _probe.happened's name is a string
await expectEmitted("_probe.happened", { name: 1 });

export const enabledProvider: SocialProvider = "github";
// @ts-expect-error google is not turned on
export const disabledProvider: SocialProvider = "google";

await emit("_probe.happened", { name: "Ada" });
// @ts-expect-error no event is named probe.missing
await emit("probe.missing", {});
