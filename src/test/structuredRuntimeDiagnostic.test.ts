import { describe, expect, test } from "vitest";
import {
  toRuntimeDiagnostic,
} from "../common/runtimeDiagnostic";
import {
  formatRuntimeError,
  getRuntimeErrorHandlerScript,
} from "../common/runtimeErrorHandling";

describe("structured iframe diagnostics", () => {
  test("retains useful stack and source information", () => {
    const error = new TypeError("no rows");
    error.stack = "TypeError: no rows\n  at draw (index.js:8:3)";
    const diagnostic = toRuntimeDiagnostic({
      error,
      filename: "about:srcdoc",
      lineno: 8,
      colno: 3,
    });
    expect(diagnostic).toMatchObject({
      version: 1,
      kind: "runtime",
      name: "TypeError",
      message: "no rows",
      line: 8,
      column: 3,
      filename: "about:srcdoc",
    });
    expect(diagnostic.stack).toContain("index.js:8:3");
  });

  test("does not invent details for redacted cross-origin errors", () => {
    const event = { message: "Script error.", error: null };
    const diagnostic = toRuntimeDiagnostic(event);
    expect(diagnostic).toMatchObject({
      version: 1,
      kind: "runtime",
      redacted: true,
    });
    expect(diagnostic.message).toContain("browser hid");
    expect(diagnostic.stack).toBeUndefined();
    expect(formatRuntimeError(event as ErrorEvent)).toContain("browser hid");
  });

  test("captures load errors, promises, CSP violations, and caps stacks", () => {
    expect(toRuntimeDiagnostic({
      target: { tagName: "SCRIPT", src: "https://example.org/x.js" },
    })).toMatchObject({
      kind: "resource",
      message: "Failed to load script: https://example.org/x.js",
    });
    expect(toRuntimeDiagnostic(
      { reason: new Error("network") }, "unhandled_rejection",
    )).toMatchObject({
      kind: "unhandled_rejection",
      message: "network",
    });
    expect(toRuntimeDiagnostic(
      { violatedDirective: "script-src", blockedURI: "https://no.example" },
      "security_policy",
    )).toMatchObject({
      kind: "security_policy",
      message: "script-src blocked https://no.example",
    });
    expect(toRuntimeDiagnostic({
      error: { name: "Error", message: "boom", stack: "x".repeat(15000) },
    }).stack?.length).toBe(12000);
  });

  test("generated iframe script reports both message formats in the correct order", () => {
    const listeners: Record<string, (event: unknown) => void> = {};
    const posted: unknown[] = [];
    const window = {
      addEventListener: (name: string, callback: (event: unknown) => void) => {
        listeners[name] = callback;
      },
    };
    const parent = { postMessage: (message: unknown) => posted.push(message) };
    new Function("window", "parent", getRuntimeErrorHandlerScript())(
      window, parent,
    );
    expect(Object.keys(listeners).sort()).toEqual(
      ["error", "securitypolicyviolation", "unhandledrejection"],
    );
    listeners.error({ message: "Script error.", error: null });
    expect(posted[0]).toMatchObject({
      type: "runtimeDiagnostic",
      diagnostic: { version: 1, redacted: true },
    });
    expect(posted[1]).toMatchObject({ type: "runtimeError" });
    listeners.error({
      target: { tagName: "SCRIPT", src: "https://example.org/bad.js" },
    });
    expect(posted[2]).toMatchObject({
      type: "runtimeDiagnostic",
      diagnostic: { kind: "resource" },
    });
  });
});
