import { Browser, Page } from "puppeteer";
import { rollup } from "rollup";
import { expect } from "vitest";
import { FileCollection } from "@vizhub/viz-types";
import { build } from "../build";

const DEBUG = false;

interface TestStackTraceOptions {
  browser: Browser;
  files: FileCollection;
  expectedLineNumber: number;
}

// Invokes Puppeteer to test the HTML in a browser,
// and isolates the console.log output to check against expectedLog.
// Captures stack trace from an error in the page and validates that sourcemaps are working
export async function testStackTrace({
  browser,
  files,
  expectedLineNumber,
}: TestStackTraceOptions) {
  const page: Page = await browser.newPage();
  let errorCaptured = false;

  try {
    // Enable sourcemaps for proper stack traces
    const { html } = await build({
      files,
      rollup,
      enableSourcemap: true,
    });

    // Capture page errors with their stack traces
    page.on("pageerror", (error: unknown) => {
      errorCaptured = true;

      if (!(error instanceof Error)) {
        DEBUG &&
          console.log(
            "[testStackTrace] Non-Error caught:",
            error,
          );
        return;
      }

      const stack = error.stack || "";
      DEBUG &&
        console.log("[testStackTrace] Error stack:", stack);

      // Verify the error message contains the expected text
      expect(error.message).toContain("Hello main!");

      // Find any stack frame with a line number close to what we expect
      // Different browsers format stack traces differently
      const stackLines = stack.split("\n");
      let foundExpectedLineNumber = false;

      for (const line of stackLines) {
        // Look for patterns like: at generateError (error.js:3:3) or at file:///path/bundle.js:20:3
        const lineMatches = line.match(/:\d+:/);
        if (lineMatches) {
          const lineNumber = parseInt(
            lineMatches[0].slice(1, -1),
            10,
          );
          DEBUG &&
            console.log(
              `[testStackTrace] Found line number in stack: ${lineNumber}`,
            );

          // Check if this line number matches any of our expected line numbers
          if (expectedLineNumber === lineNumber) {
            foundExpectedLineNumber = true;
            break;
          }
        }
      }

      expect(
        foundExpectedLineNumber,
        `Stack trace should contain expected line number(s): ${expectedLineNumber}`,
      ).toBe(true);
    });

    await page.setContent(html);

    // Wait a bit for scripts to execute and error to be thrown
    await new Promise((resolve) =>
      setTimeout(resolve, 200),
    );

    // Verify that we actually captured an error
    expect(
      errorCaptured,
      "An error should have been thrown",
    ).toBe(true);
  } finally {
    await page.close();
  }
}
