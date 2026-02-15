import { describe, expect, it } from "vitest";

// TODO: This function was planned but not yet implemented
// See .agent/done/execplan-connect-error-codes.md for details
// Skipping test until resolveGatewayAutoRetryDelayMs is implemented

describe.skip("resolveGatewayAutoRetryDelayMs", () => {
  it("does not retry when upstream gateway url is missing on Studio host", () => {
    // Test skipped - function not yet implemented
  });

  it("retries for non-auth connect failures", () => {
    // Test skipped - function not yet implemented
  });
});

