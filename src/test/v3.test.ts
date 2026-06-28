import puppeteer, { Browser } from "puppeteer";
import { describe, it, beforeAll, afterAll } from "vitest";
import { compile } from "svelte/compiler";
import { testInBrowser } from "./testInBrowser";
import {
  basicIndexJS,
  jsExport,
  cssImport,
  csvImport,
  csvStrangeChars,
  svelte,
  sampleContent,
  sampleContentVizImport,
  sampleContentVizImportSlug,
  sampleContentWithCSS,
  sampleContentVizImportWithCSS,
  sourcemap,
  d3Dependency,
} from "./fixtures/v3";
import { createVizCache } from "../v3/vizCache";
import { createSlugCache } from "../v3/slugCache";
import { SvelteCompiler } from "../v3/transformSvelte";
import { testStackTrace } from "./testStackTrace";
// import { JSDOM } from "jsdom";
// import { setJSDOM } from "../common/domParser";

// setJSDOM(JSDOM);

let browser: Browser;

beforeAll(async () => {
  browser = await puppeteer.launch({
    args: ["--no-sandbox"],
  });
});

afterAll(async () => {
  if (browser) {
    await browser.close();
  }
});

describe("VizHub Runtime v3", () => {
  it("should run main without index.html", async () => {
    await testInBrowser({
      browser,
      files: basicIndexJS,
      expectedLog: "Hello main!",
    });
  });

  it("should handle JS exports", async () => {
    await testInBrowser({
      browser,
      files: jsExport,
      expectedLog: "Outer Inner",
    });
  });

  it("should handle CSS imports", async () => {
    await testInBrowser({
      browser,
      files: cssImport,
      expectedLog: "rgb(255, 0, 0)",
    });
  });

  it("should handle CSV imports", async () => {
    await testInBrowser({
      browser,
      files: csvImport,
      expectedLog: "Setosa",
    });
  });

  it("should handle CSV with strange characters", async () => {
    await testInBrowser({
      browser,
      files: csvStrangeChars,
      expectedLog: "Türkiye",
    });
  });

  it("should handle viz imports", async () => {
    await testInBrowser({
      browser,
      expectedLog: "Imported from viz: Outer Inner",
      vizCache: createVizCache({
        initialContents: [
          sampleContent,
          sampleContentVizImport,
        ],
      }),
      vizId: sampleContentVizImport.id,
    });
  });

  it("should handle viz imports with slug", async () => {
    await testInBrowser({
      browser,
      expectedLog:
        "Imported from viz with slug: Outer Inner",
      vizCache: createVizCache({
        initialContents: [
          sampleContent,
          sampleContentVizImportSlug,
        ],
      }),
      vizId: sampleContentVizImportSlug.id,
      slugCache: createSlugCache({
        initialMappings: {
          "joe/sample-content-slug": sampleContent.id,
        },
      }),
    });
  });

  it("should handle viz imports with CSS", async () => {
    await testInBrowser({
      browser,
      expectedLog: "rgb(255, 0, 0)",
      vizCache: createVizCache({
        initialContents: [
          sampleContentWithCSS,
          sampleContentVizImportWithCSS,
        ],
      }),
      vizId: sampleContentVizImportWithCSS.id,
    });
  });

  it("should handle Svelte components", async () => {
    await testInBrowser({
      browser,
      files: svelte,
      expectedLog: "Svelte",
      getSvelteCompiler: async () =>
        compile as unknown as SvelteCompiler,
    });
  });

  it("should provide sourcemaps with correct line numbers in stack traces", async () => {
    await testStackTrace({
      browser,
      files: sourcemap,
      expectedLineNumber: 6,
    });
  });

  it("should handle d3 dependency", async () => {
    await testInBrowser({
      browser,
      files: d3Dependency,
      expectedLog: "function",
    });
  });
});
