import { expect } from "vitest";
import "../../src/testing/matchers";

declare const error: unknown;

expect(error).toBeTrpcError("NOT_FOUND");
expect(error).toBeActionError("post.body-empty");

// @ts-expect-error an action's declared code is not a tRPC code
expect(error).toBeTrpcError("post.body-empty");
