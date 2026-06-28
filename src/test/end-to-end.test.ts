import puppeteer, { Browser } from "puppeteer";
import {
  describe,
  it,
  beforeAll,
  afterAll,
  expect,
} from "vitest";
import { testRuntimeWithWorker } from "./testRuntimeWithWorker";

let browser: Browser | null = null;

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

/**
 * These end-to-end tests require the demo app to be running:
 *   npm run demo
 * (from the project root, in another terminal)
 * Without it, tests will fail with ERR_CONNECTION_REFUSED.
 */
describe("VizHub Runtime End to End (Web Worker, iframe)", () => {
  it("should connect to demo app server (requires `npm run demo` in another terminal)", async () => {
    if (!browser) {
      throw new Error("Browser is not initialized");
    }

    const page = await browser.newPage();

    try {
      await page.goto("http://localhost:3001");

      // Wait for runtime to be defined (up to 5 seconds)
      await page.waitForFunction(
        () => typeof window.runtime !== "undefined",
        { timeout: 5000 },
      );

      // Check if runtime is defined
      const runtimeDefined = await page.evaluate(() => {
        return typeof window.runtime !== "undefined";
      });

      expect(runtimeDefined).toBe(true);
    } finally {
      await page.close();
    }
  });

  it("should handle basic code changes", async () => {
    await testRuntimeWithWorker({
      browser,
      initialFiles: {
        "index.js": `
          export const main = () => {
            console.log("Initial version");
          }
        `,
      },
      expectedLog: "Initial version",
      codeChanges: [
        {
          files: {
            "index.js": `
              export const main = () => {
                console.log("First update");
              }
            `,
          },
          expectedLog: "First update",
        },
        {
          files: {
            "index.js": `
              export const main = () => {
                console.log("Second update");
              }
            `,
          },
          expectedLog: "Second update",
        },
      ],
    });
  });

  it("should hot reload JS with v3 runtime", async () => {
    await testRuntimeWithWorker({
      browser,
      initialFiles: {
        "index.js": `
          export const main = (container, {state, setState}) => {
            if(!state.count) {
              setState(state => ({...state, count: 5}));
              return;
            }
            console.log("state.count = " + state.count);
          }
        `,
      },
      expectedLog: "state.count = 5",
      codeChanges: [
        {
          files: {
            "index.js": `
              export const main = (container, {state, setState}) => {
                console.log("state.count = " + state.count);
              }
            `,
          },
          expectedLog: "state.count = 5",
        },
      ],
    });
  });

  it("should hot reload CSS with v3 runtime", async () => {
    await testRuntimeWithWorker({
      browser,
      initialFiles: {
        "index.js": `
          import "./style.css";
          export const main = (container, { state, setState }) => {
            if(!state.color) {
              const color = getComputedStyle(document.body).backgroundColor;
              console.log("body background color: " + color);
              setState(state => ({...state, color}));
              return;
            }
          }
        `,
        "style.css": `
          body {
            background-color: red;
          }
        `,
      },
      expectedLog: "body background color: rgb(255, 0, 0)",
      codeChanges: [
        {
          files: {
            "index.js": `
              import "./style.css";
              export const main = (container, { state, setState }) => {
                const color = getComputedStyle(document.body).backgroundColor;
                console.log("old: " + state.color + ", new: " + color);
              }
            `,
            "style.css": `
              body {
                background-color: blue;
              }
            `,
          },
          expectedLog:
            // "old: rgb(255, 0, 0), new: rgb(255, 0, 0)",
            "old: rgb(255, 0, 0), new: rgb(0, 0, 255)",
        },
      ],
    });
  });
});
