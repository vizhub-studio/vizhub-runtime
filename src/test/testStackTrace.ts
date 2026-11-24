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

// The v3 build injects the bundle into a <script> tag in the generated
// document. Chromium reports stack-trace line numbers relative to the
// enclosing document, while the sourcemap "line numbers" we care about are
// relative to the bundle (which preserves the source line numbering).
// Compute the document line on which the injected bundle starts so we can
// translate the expected bundle line into a document line.
const getInjectedScriptStartLine = (
  html: string,
): number => {
  const marker = '<script id="injected-script">';
  const index = html.indexOf(marker);
  if (index === -1) {
    return 1;
  }
  // The bundle's first line is on the same document line as the marker.
  return html.slice(0, index + marker.length).split("\n")
    .length;
};

const getStackLineNumbers = (stack: string): number[] => {
  const lineNumbers: number[] = [];
  for (const line of stack.split("\n")) {
    // Look for patterns like: at fn (file.js:12:3) or at <anonymous> (:6:11)
    const matches = line.matchAll(/:(\d+):(\d+)/g);
    for (const match of matches) {
      lineNumbers.push(parseInt(match[1], 10));
    }
  }
  return lineNumbers;
};

// Invokes Puppeteer to test the HTML in a browser,
// and verifies that an error thrown by the bundle surfaces a stack trace
// containing the expected source line number.
export async function testStackTrace({
  browser,
  files,
  expectedLineNumber,
}: TestStackTraceOptions) {
  const page: Page = await browser.newPage();
  const stacks: string[] = [];

  try {
    // Enable sourcemaps for proper stack traces
    const { html } = await build({
      files,
      rollup,
      enableSourcemap: true,
    });

    if (!html) {
      throw new Error("Build did not produce HTML");
    }

    // Capture page errors without asserting inside the event handler:
    // assertions thrown asynchronously show up as unhandled rejections
    // instead of failing the test cleanly.
    page.on("pageerror", (error: unknown) => {
      if (!(error instanceof Error)) {
        DEBUG &&
          console.log(
            "[testStackTrace] Non-Error caught:",
            error,
          );
        return;
      }

      expect(error.message).toContain("Hello main!");
      stacks.push(error.stack || "");
    });

    await page.setContent(html);

    // Wait a bit for scripts to execute and error to be thrown
    await new Promise((resolve) =>
      setTimeout(resolve, 200),
    );

    // Verify that we actually captured an error
    expect(
      stacks.length,
      "An error should have been thrown",
    ).toBeGreaterThan(0);

    // Chromium versions differ in whether inline-script stack frames report
    // lines relative to the script or to the enclosing document. Accept
    // either representation so the test is stable across versions.
    const injectedScriptStartLine =
      getInjectedScriptStartLine(html);
    const expectedLineNumbers = [
      expectedLineNumber,
      injectedScriptStartLine + expectedLineNumber - 1,
    ];
    const foundLineNumbers = stacks.flatMap(
      getStackLineNumbers,
    );

    DEBUG &&
      console.log(
        "[testStackTrace] Expected line numbers:",
        expectedLineNumbers,
        "found:",
        foundLineNumbers,
        "\nstacks:\n",
        stacks.join("\n"),
      );

    expect(
      foundLineNumbers.some((lineNumber) =>
        expectedLineNumbers.includes(lineNumber),
      ),
      `Stack trace should contain one of the expected line numbers ` +
        `${expectedLineNumbers.join(", ")}. Found: ` +
        `${foundLineNumbers.join(", ")}`,
    ).toBe(true);
  } finally {
    await page.close();
  }
}
