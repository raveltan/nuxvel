<script setup lang="ts">
import type { TrpcMocks, TrpcPath, TrpcProcedure } from "@nuxvel/nuxt/storybook/mocks";
import type { ComponentExpect, Locator, LocatorAssertions, ToastLocator } from "@nuxvel/nuxt/storybook/test";

type StorybookTest = typeof import("@nuxvel/nuxt/storybook/test");

type IsAny<T> = 0 extends 1 & T ? true : false;
type ByIdMock = NonNullable<NonNullable<TrpcMocks["post"]>["byId"]>;
type ByIdInput = Parameters<ByIdMock>[0];
type ByIdOutput = Awaited<ReturnType<ByIdMock>>;
type MockedUser = NonNullable<Parameters<typeof import("@nuxvel/nuxt/storybook/mocks").mockUser>[0]>;

const inputIsTyped: IsAny<ByIdInput> extends true ? never : ByIdInput extends { id: number } ? true : never = true;
const outputIsTyped: IsAny<ByIdOutput> extends true
  ? never
  : ByIdOutput extends { title: string; can: { update: boolean; delete: boolean } }
    ? true
    : never = true;
const userIsTyped: IsAny<MockedUser> extends true ? never : MockedUser["email"] extends string | undefined ? true : never = true;

type ButtonResult = ReturnType<StorybookTest["button"]>;
type ToastScope = Parameters<StorybookTest["toast"]>[0];
const helpersAreTyped: IsAny<ButtonResult> extends true ? never : ButtonResult extends Locator ? true : never = true;
const pageIsTyped: IsAny<StorybookTest["page"]> extends true ? never : StorybookTest["page"] extends Locator ? true : never = true;
const toastIsTyped: IsAny<ReturnType<StorybookTest["toast"]>> extends true ? never : ReturnType<StorybookTest["toast"]> extends ToastLocator ? true : never = true;
const scopeTakesCanvas: HTMLElement extends ToastScope ? (Locator extends ToastScope ? true : never) : never = true;

declare const expect: ComponentExpect;
declare const trpcSpy: typeof import("@nuxvel/nuxt/storybook/mocks").trpcSpy;
declare const locator: Locator;

function expectTypeChecks() {
  const onLocator = expect(locator);
  const onValue = expect(1);
  const locatorIsTyped: IsAny<typeof onLocator> extends true ? never : typeof onLocator extends LocatorAssertions ? true : never = true;
  const valueIsTyped: IsAny<typeof onValue> extends true ? never : typeof onValue extends { toBe(expected: number): Promise<void> } ? true : never = true;
  // @ts-expect-error a locator has no value matchers
  void expect(locator).toEqual(1);
  // @ts-expect-error a value has no locator assertions
  void expect(1).toHaveCount(1);
  // @ts-expect-error pressSequentially takes a number as its delay
  void locator.pressSequentially("hi", { delay: "50" });
  // @ts-expect-error toHaveCount takes a number
  void expect(locator).toHaveCount("2");
  return locatorIsTyped && valueIsTyped;
}

function trpcSpyTypeChecks() {
  const update = trpcSpy("post.update", (input) => ({ id: input.id, title: input.title, body: input.body, authorId: "user-1", createdAt: new Date(), updatedAt: new Date(), deletedAt: null }));
  const pathIsTyped: IsAny<TrpcPath> extends true ? never : "post.update" extends TrpcPath ? true : never = true;
  const procedureIsTyped: IsAny<Parameters<TrpcProcedure<"post.update">>[0]> extends true ? never : true = true;
  void expect(update).toHaveBeenCalledWith({ id: 1, title: "Hello", body: "Body" });
  void expect(update).not.toHaveBeenCalled({ timeout: 100 });
  void expect(update).toHaveBeenLastCalledWith({ id: 1, title: expect.any(String), body: "Body" });
  // @ts-expect-error the router has no procedure post.updat
  trpcSpy("post.updat");
  // @ts-expect-error the input of post.update has no titel
  trpcSpy("post.update", (input) => ({ ...input, titel: input.titel }));
  // @ts-expect-error post.update returns a post, not a number
  trpcSpy("post.update", () => 42);
  // @ts-expect-error the id of the post.update input is a number
  void expect(update).toHaveBeenCalledWith({ id: "1", title: "Hello", body: "Body" });
  // @ts-expect-error toHaveBeenCalledTimes takes a number
  void expect(update).toHaveBeenCalledTimes("1");
  return pathIsTyped && procedureIsTyped;
}

const now = new Date();
const post = { title: "Hello", body: "Body", authorId: "user-1", createdAt: now, updatedAt: now, deletedAt: null };
const mocks: TrpcMocks = { post: { byId: ({ id }) => ({ ...post, id, can: { update: id > 0, delete: false } }) } };
// @ts-expect-error can holds booleans
const wrongOutput: TrpcMocks = { post: { byId: ({ id }) => ({ ...post, id, can: { update: "yes", delete: false } }) } };
// @ts-expect-error the post router has no procedure named nope
const unknownProcedure: TrpcMocks = { post: { nope: () => 1 } };
</script>

<template>
  <p>{{ inputIsTyped }} {{ outputIsTyped }} {{ userIsTyped }} {{ Boolean(mocks && wrongOutput && unknownProcedure) }}
    {{ helpersAreTyped }} {{ pageIsTyped }} {{ toastIsTyped }} {{ scopeTakesCanvas }} {{ typeof expectTypeChecks }} {{ typeof trpcSpyTypeChecks }}</p>
</template>
