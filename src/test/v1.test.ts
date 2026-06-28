import puppeteer, { Browser } from "puppeteer";
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
} from "vitest";
import { testInBrowser } from "./testInBrowser";
import {
  basicHTML,
  fetchProxy,
  jsScriptTag,
  styleTest,
  xmlTest,
  protocolTest,
  imageInHTML,
  svgInHTML,
  noImagesHTML,
  mixedContentHTML,
} from "./fixtures/v1";
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

describe("VizHub Runtime v1", () => {
  it("should generate srcdoc HTML", async () => {
    const { html } = await build({
      files: basicHTML,
    });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain(
      "<title>My HTML Document</title>",
    );
    expect(html).toContain("Hello, World!");
  });

  it("basicHTML", async () => {
    await testInBrowser({
      browser,
      files: basicHTML,
      expectedLog: "Hello, World!",
    });
  });

  it("jsScriptTag", async () => {
    await testInBrowser({
      browser,
      files: jsScriptTag,
      expectedLog: "Hello, JS!",
    });
  });

  it("fetchProxy", async () => {
    await testInBrowser({
      browser,
      files: fetchProxy,
      expectedLog: "Hello, Fetch!",
    });
  });

  it("should handle CSS file loading", async () => {
    await testInBrowser({
      browser,
      files: styleTest,
      expectedLog: "rgb(255, 0, 0)",
    });
  });

  it("should handle XML file loading", async () => {
    await testInBrowser({
      browser,
      files: xmlTest,
      expectedLog: "root",
    });
  });

  it("should convert protocol-less URLs to https", async () => {
    const { html } = await build({ files: protocolTest });
    expect(html).toContain(
      'href="https://fonts.googleapis.com',
    );
    expect(html).toContain('src="https://code.jquery.com');
  });

  it("should handle images in HTML", async () => {
    const { html } = await build({ files: imageInHTML });
    // Check that image src attributes are converted to data URLs
    expect(html).toContain(
      'src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEBLAEsAAD/4RqSRXhpZgAASUkqAAgAAAAIAA4BAgASAAAAbgAAABIBAwABAAAAAQAAABoBBQABAAAAgAAAABsBBQABAAAAiAAAACgBAwABAAAAAgAAADEBAgANAAAAkAAAADIBAgAUAAAAngAAAGmHBAABAAAAsgAAAOoAAABDcmVhdGVkIHdpdGggR0lNUAAsAQAAAQAAACwBAAABAAAAR0lNUCAyLjEwLjMwAAA',
    );
    expect(html).toContain(
      'src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="',
    );
    expect(html).toContain('alt="Tiny favicon"');
    expect(html).toContain('alt="Test icon"');
  });

  it("should handle SVG images", async () => {
    const { html } = await build({ files: svgInHTML });
    expect(html).toContain('src="data:image/svg+xml;utf8,');
    expect(html).toContain("circle%20cx%3D%2250%22");
  });

  it("should leave external image references unchanged", async () => {
    const { html } = await build({ files: noImagesHTML });
    expect(html).toContain('src="external-image.jpg"');
    expect(html).not.toContain("data:image");
  });

  it("should handle mixed content with images", async () => {
    const { html } = await build({
      files: mixedContentHTML,
    });
    // Should process existing images
    expect(html).toContain(
      'src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="',
    );
    expect(html).toContain(
      'src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"',
    );
    // Should leave missing images unchanged
    expect(html).toContain('src="missing-image.jpg"');
    // Should preserve other content
    expect(html).toContain("Mixed content page loaded");
    expect(html).toContain('class="container"');
  });
});
