import type { ViteUserConfig } from "vitest/config";
import type {} from "../../src/testing/expect";

export const config: ViteUserConfig = { test: { provide: { nuxvelBrowserTimeout: 10_000 } } };

// @ts-expect-error nuxvelBrowserTimeout is in milliseconds
export const wrongConfig: ViteUserConfig = { test: { provide: { nuxvelBrowserTimeout: "10s" } } };
