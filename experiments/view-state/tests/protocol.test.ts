import { describe, expect, it } from "vitest";
import {
  isProtocolMessage,
  parseBridgeQuery,
  PROTOCOL,
  PROTOCOL_VERSION,
} from "../protocol.js";

describe("bounded iframe state protocol", () => {
  it("accepts only allowlisted, bounded query parameters", () => {
    const keys = new Set(["year", "region"]);
    expect(parseBridgeQuery("year=2020&region=CA", keys)?.get("year"))
      .toBe("2020");
    expect(parseBridgeQuery("commit=private", keys)).toBeNull();
    expect(parseBridgeQuery("year=2020&year=2024", keys)?.getAll("year"))
      .toEqual(["2020", "2024"]);
    expect(parseBridgeQuery("year=" + "x".repeat(513), keys))
      .toBeNull();
    expect(parseBridgeQuery("year=2020&", keys)?.get("year"))
      .toBe("2020");
    expect(parseBridgeQuery("x=".repeat(33))).toBeNull();
    expect(parseBridgeQuery("year=" + "x".repeat(2049))).toBeNull();
    expect(parseBridgeQuery("0bad=1")).toBeNull();
    expect(parseBridgeQuery("")).not.toBeNull();
  });

  it("ignores non-protocol and unrelated messages", () => {
    expect(isProtocolMessage(null, "ready")).toBe(false);
    expect(isProtocolMessage({ type: "ready" }, "ready")).toBe(false);
    expect(isProtocolMessage({
      protocol: PROTOCOL,
      version: PROTOCOL_VERSION,
      type: "ready",
    }, "ready")).toBe(true);
    expect(isProtocolMessage({
      protocol: PROTOCOL,
      version: PROTOCOL_VERSION,
      type: "write",
    }, "ready")).toBe(false);
  });
});
