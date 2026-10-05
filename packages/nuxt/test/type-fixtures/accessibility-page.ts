import type { Page } from "playwright-core";
import { expectAccessible } from "../../src/testing/expect-accessible";

declare const page: Page;

await expectAccessible(page);

// @ts-expect-error a page needs evaluate() and url()
await expectAccessible({ url: () => "/" });
