import { describe, expect, test } from "vitest";
import { build } from "../build";
import { FileCollection } from "@vizhub/viz-types";

// Mock rollup function for testing
const mockRollup = async () =>
  ({
    generate: async () => ({
      output: [
        {
          type: "chunk" as const,
          code: 'console.log("test");',
          fileName: "bundle.js",
        },
      ],
    }),
    close: async () => {},
  }) as any;

describe("Runtime Error Handling - All Versions", () => {
  test("V1 runtime should include runtime error handlers", async () => {
    const files: FileCollection = {
      "index.html": `<!DOCTYPE html>
        <html>
          <head><title>V1 Test</title></head>
          <body>
            <h1>Hello V1</h1>
            <script>console.log('V1 test');</script>
          </body>
        </html>`,
    };

    const result = await build({ files });

    expect(result.runtimeVersion).toBe("v1");
    expect(result.html).toContain(
      "window.addEventListener('error'",
    );
    expect(result.html).toContain(
      "window.addEventListener('unhandledrejection'",
    );
    expect(result.html).toContain("parent.postMessage");
    expect(result.html).toContain("type: 'runtimeError'");
    expect(result.html).toContain("Hello V1");
  });

  test("V2 runtime should include runtime error handlers", async () => {
    const files: FileCollection = {
      "index.html": `<!DOCTYPE html>
        <html>
          <head><title>V2 Test</title></head>
          <body>
            <h1>Hello V2</h1>
            <script src="bundle.js"></script>
          </body>
        </html>`,
      "index.js": `console.log('V2 test');`,
    };

    const result = await build({
      files,
      rollup: mockRollup,
    });

    expect(result.runtimeVersion).toBe("v2");
    expect(result.html).toContain(
      "window.addEventListener('error'",
    );
    expect(result.html).toContain(
      "window.addEventListener('unhandledrejection'",
    );
    expect(result.html).toContain("parent.postMessage");
    expect(result.html).toContain("type: 'runtimeError'");
    expect(result.html).toContain("Hello V2");
  });

  test("V3 runtime should include runtime error handlers", async () => {
    const files: FileCollection = {
      "index.js": `export const main = (container) => {
        container.innerHTML = '<h1>Hello V3</h1>';
      };`,
      "package.json": JSON.stringify({ dependencies: { d3: "7.0.0" } }),
    };

    // V3 requires vizCache, so we set it up
    const result = await build({
      files,
      rollup: mockRollup,
      // vizId will be auto-generated when not provided
    });

    expect(result.runtimeVersion).toBe("v3");
    expect(result.html).toContain(
      "window.addEventListener('error'",
    );
    expect(result.html).toContain(
      "window.addEventListener('unhandledrejection'",
    );
    expect(result.html).toContain("parent.postMessage");
    expect(result.html).toContain("type: 'runtimeError'");
    // V3 generates its own HTML template
    expect(result.html).toContain("viz-container");
    expect(result.html).toContain('crossorigin="anonymous"');
  });

  test("V4 runtime should include runtime error handlers", async () => {
    const files: FileCollection = {
      "index.html": `<!DOCTYPE html>
        <html>
          <head>
            <title>V4 Test</title>
            <script type="importmap">
              {
                "imports": {
                  "lodash": "https://cdn.skypack.dev/lodash"
                }
              }
            </script>
          </head>
          <body>
            <h1>Hello V4</h1>
            <script type="module" src="./index.js"></script>
          </body>
        </html>`,
      "index.js": `console.log('V4 test');`,
    };

    const result = await build({
      files,
      rollup: mockRollup,
    });

    expect(result.runtimeVersion).toBe("v4");
    expect(result.html).toContain(
      "window.addEventListener('error'",
    );
    expect(result.html).toContain(
      "window.addEventListener('unhandledrejection'",
    );
    expect(result.html).toContain("parent.postMessage");
    expect(result.html).toContain("type: 'runtimeError'");
    expect(result.html).toContain("Hello V4");
  });

  test("runtime error handler script should be valid JavaScript", () => {
    // Test that the error handler script can be executed without syntax errors
    const files: FileCollection = {
      "index.html": `<!DOCTYPE html><html><head></head><body></body></html>`,
    };

    return build({ files }).then((result) => {
      // For V1, look for ALL script tags since magic-sandbox might split them
      const scriptMatches = result.html?.match(
        /<script[^>]*>([\s\S]*?)<\/script>/g,
      );
      expect(scriptMatches).toBeTruthy();

      if (scriptMatches) {
        // Find the script that contains our error handling code
        const errorHandlerScript = scriptMatches.find(
          (script) =>
            script.includes("addEventListener") &&
            script.includes("runtimeError"),
        );

        expect(errorHandlerScript).toBeTruthy();

        if (errorHandlerScript) {
          // Extract just the content
          const scriptContent = errorHandlerScript.replace(
            /<script[^>]*>|<\/script>/g,
            "",
          );

          // Should not throw when parsing as JavaScript
          expect(
            () => new Function(scriptContent),
          ).not.toThrow();

          // Should contain error handling logic
          expect(scriptContent).toContain(
            "formatRuntimeError",
          );
          expect(scriptContent).toContain(
            "addEventListener",
          );
        }
      }
    });
  });
});
