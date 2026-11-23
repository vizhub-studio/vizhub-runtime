import { describe, it, expect } from "vitest";
import { getComputedIndexHtml } from "./getComputedIndexHtml";
import { JSDOM } from "jsdom";
import { d3ImportPkg } from "../test/fixtures/v2/d3ImportPkg";
import { FileCollection } from "@vizhub/viz-types";
// import { setJSDOM } from "../common/domParser";

// setJSDOM(JSDOM);

describe("v2 getComputedIndexHtml", () => {
  it("should return empty string if missing index.html", async () => {
    const files: FileCollection = {};
    expect(getComputedIndexHtml(files)).toEqual(``);
  });

  it("should preserve existing index.html if no bundle and no package.json", async () => {
    const text =
      "<!DOCTYPE html><html><head></head><body><h1>Hello World</h1></body></html>";
    const files: FileCollection = { "index.html": text };
    const result = getComputedIndexHtml(files);

    // Should include the original content
    expect(result).toContain("<h1>Hello World</h1>");
    expect(result).toContain("<!DOCTYPE html>");
    // Should include runtime error handler
    expect(result).toContain(
      "window.addEventListener('error'",
    );
    expect(result).toContain("parent.postMessage");
    expect(result).toContain("type: 'runtimeError'");
  });

  it("should add bundle.js, no package.json", async () => {
    const files: FileCollection = {
      "index.html":
        "<!DOCTYPE html><html><head></head><body></body></html>",
      "index.js": 'console.log("Hello")',
    };
    const result = getComputedIndexHtml(files);

    // Should include bundle.js script
    expect(result).toContain(
      '<script src="bundle.js"></script>',
    );
    expect(result).toContain("<!DOCTYPE html>");
    // Should include runtime error handler
    expect(result).toContain(
      "window.addEventListener('error'",
    );
    expect(result).toContain("parent.postMessage");
    expect(result).toContain("type: 'runtimeError'");
  });

  it("should handle d3 dependency from package.json", async () => {
    const files: FileCollection = d3ImportPkg;
    const result = getComputedIndexHtml(files);

    // Create a DOM to parse and check the result
    const dom = new JSDOM(result);
    const document = dom.window.document;

    // Check that we have the d3 script in the head
    const d3Script = document.querySelector(
      'head script[src*="d3@6.7.0"]',
    );
    expect(d3Script).not.toBeNull();
    expect(d3Script?.getAttribute("crossorigin")).toBe("anonymous");

    // Check that we have the bundle.js script in the body
    const bundleScript = document.querySelector(
      'body script[src="bundle.js"]',
    );
    expect(bundleScript).not.toBeNull();

    // Verify the order: d3 in head, bundle.js in body
    expect(result.indexOf("d3@6.7.0")).toBeLessThan(
      result.indexOf("<body>"),
    );
    expect(result.indexOf("<body>")).toBeLessThan(
      result.indexOf("bundle.js"),
    );
  });

  // Edge cases and degenerate inputs
  it("should handle malformed HTML in index.html", async () => {
    const malformedHtml =
      "<html><head>No closing head tag<body>No closing body tag";
    const files: FileCollection = {
      "index.html": malformedHtml,
      "index.js": 'console.log("Hello")',
    };

    const result = getComputedIndexHtml(files);

    // Should still have both head and body tags
    expect(result).toContain("<head>");
    expect(result).toContain("</head>");
    expect(result).toContain("<body>");
    expect(result).toContain("</body>");

    // Should have bundle.js in the body
    const dom = new JSDOM(result);
    const bundleScript = dom.window.document.querySelector(
      'body script[src="bundle.js"]',
    );
    expect(bundleScript).not.toBeNull();
  });

  it("should handle HTML without html, head, or body tags", async () => {
    const minimalHtml = "<div>Just a div</div>";
    const files: FileCollection = {
      "index.html": minimalHtml,
      "index.js": 'console.log("Hello")',
      "package.json": JSON.stringify({
        dependencies: {
          d3: "6.7.0",
        },
      }),
    };

    const result = getComputedIndexHtml(files);

    // Should create proper HTML structure
    expect(result).toContain("<html>");
    expect(result).toContain("<head>");
    expect(result).toContain("<body>");

    // Should have d3 in head and bundle.js in body
    const dom = new JSDOM(result);
    const document = dom.window.document;

    const d3Script = document.querySelector(
      'head script[src*="d3@6.7.0"]',
    );
    expect(d3Script).not.toBeNull();

    const bundleScript = document.querySelector(
      'body script[src="bundle.js"]',
    );
    expect(bundleScript).not.toBeNull();

    // Original content should be preserved
    expect(result).toContain("<div>Just a div</div>");
  });

  it("should handle empty index.html", async () => {
    const files: FileCollection = {
      "index.html": "",
      "index.js": 'console.log("Hello")',
    };

    const result = getComputedIndexHtml(files);

    // Should create a minimal HTML structure with bundle.js
    expect(result).toContain("<html>");
    expect(result).toContain("<body>");
    expect(result).toContain('script src="bundle.js"');
  });

  it("should handle multiple existing script tags", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <script src="existing1.js"></script>
          <script src="bundle.js"></script>
        </head>
        <body>
          <script src="existing2.js"></script>
          <script src="bundle.js"></script>
        </body>
      </html>
    `;

    const files: FileCollection = {
      "index.html": html,
      "index.js": 'console.log("Hello")',
      "package.json": JSON.stringify({
        dependencies: {
          d3: "6.7.0",
        },
      }),
    };

    const result = getComputedIndexHtml(files);

    // Create DOM to analyze the result
    const dom = new JSDOM(result);
    const document = dom.window.document;

    // Should keep existing scripts
    expect(
      document.querySelectorAll(
        'script[src="existing1.js"]',
      ).length,
    ).toBe(1);
    expect(
      document.querySelectorAll(
        'script[src="existing2.js"]',
      ).length,
    ).toBe(1);

    // Should have exactly one bundle.js script in the body
    const bundleScripts = document.querySelectorAll(
      'script[src="bundle.js"]',
    );
    expect(bundleScripts.length).toBe(1);
    expect(bundleScripts[0].parentElement).toBe(
      document.body,
    );

    // Should have d3 script in the head
    const d3Script = document.querySelector(
      'head script[src*="d3@6.7.0"]',
    );
    expect(d3Script).not.toBeNull();
  });
});
