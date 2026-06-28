import puppeteer, { Browser } from "puppeteer";
import { rollup } from "rollup";
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
} from "vitest";
import { testInBrowser } from "./testInBrowser";
import {
  basicBundle,
  d3Import,
  d3ImportPkg,
  reactImport,
  reactImportPkg,
  reactDomImport,
  reactDomImportPkg,
  jsxTranspile,
  es6Preserve,
  generatorSupport,
  unicodeSupport,
  d3RosettaImportPkg,
  basicBundleNoExtension,
  syntaxError,
  jsxTranspileJSXExt,
  basicBundleNameCollision,
} from "./fixtures/v2";
import { build } from "../build";
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

describe("VizHub Runtime v2", () => {
  it("should bundle basic imports", async () => {
    await testInBrowser({
      browser,
      files: basicBundle,
      expectedLog: "bar",
    });
  });

  it("should bundle basic imports missing .js extension", async () => {
    await testInBrowser({
      browser,
      files: basicBundleNoExtension,
      expectedLog: "bar",
    });
  });

  it("should bundle with same variable across modules", async () => {
    await testInBrowser({
      browser,
      files: basicBundleNameCollision,
      expectedLog: "11 22",
    });
  });

  it("should support d3 imports", async () => {
    await testInBrowser({
      browser,
      files: d3Import,
      expectedLog: "function",
    });
  });

  it("should support d3 imports from packages", async () => {
    await testInBrowser({
      browser,
      files: d3ImportPkg,
      expectedLog: "function",
    });
  });

  it("should support React imports", async () => {
    await testInBrowser({
      browser,
      files: reactImport,
      expectedLog: "object",
    });
  });

  it("should support React imports from packages", async () => {
    await testInBrowser({
      browser,
      files: reactImportPkg,
      expectedLog: "object",
    });
  });

  it("should support ReactDOM imports", async () => {
    await testInBrowser({
      browser,
      files: reactDomImport,
      expectedLog: "object",
    });
  });

  it("should support ReactDOM imports from packages", async () => {
    await testInBrowser({
      browser,
      files: reactDomImportPkg,
      expectedLog: "object",
    });
  });

  it("should transpile JSX from index.js", async () => {
    const { html } = await build({
      files: jsxTranspile,
      rollup,
    });
    expect(html).toContain("React.createElement");
  });

  it("should transpile JSX from index.jsx", async () => {
    const { html } = await build({
      files: jsxTranspileJSXExt,
      rollup,
    });
    expect(html).toContain("React.createElement");
  });

  it("should preserve ES6 syntax", async () => {
    await testInBrowser({
      browser,
      files: es6Preserve,
      expectedLog: "16", // 4 * 4 = 16
    });
  });

  it("should support generator functions", async () => {
    await testInBrowser({
      browser,
      files: generatorSupport,
      expectedLog: "5",
    });
  });

  it("should support unicode characters", async () => {
    await testInBrowser({
      browser,
      files: unicodeSupport,
      expectedLog: "Привет",
    });
  });

  it("should handle globals config for arbitrary package d3-rosetta", async () => {
    await testInBrowser({
      browser,
      files: d3RosettaImportPkg,
      expectedLog: "function",
    });
  });

  it("should handle syntax error", async () => {
    await expect(
      testInBrowser({
        browser,
        files: syntaxError,
        expectedLog: "function",
      }),
    ).rejects.toThrow(
      /Error transforming foo\.js: Unexpected token/,
    );
  });
});
