import type { Page } from "playwright/test";

export const pausedClocks = new WeakSet<Page>();
