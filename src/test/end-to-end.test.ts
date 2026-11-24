import puppeteer, { Browser } from "puppeteer";
import {
  describe,
  it,
  beforeAll,
  afterAll,
  expect,
} from "vitest";
import {
  spawn,
  type ChildProcess,
} from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { testRuntimeWithWorker } from "./testRuntimeWithWorker";

const DEMO_URL = "http://localhost:3001";
const demoAppDir = fileURLToPath(
  new URL("../../demo-app", import.meta.url),
);

let browser: Browser | null = null;
let server: ChildProcess | null = null;
let serverAvailable = false;

const isServerUp = async (
  url: string,
): Promise<boolean> => {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
};

const waitForServer = async (
  url: string,
): Promise<boolean> => {
  const timeoutMs = 60_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerUp(url)) {
      return true;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, 250),
    );
  }
  return false;
};

const run = async (
  command: string,
  args: string[],
  cwd: string,
): Promise<void> => {
  const child = spawn(command, args, {
    cwd,
    stdio: "ignore",
  });
  const [code] = (await once(child, "exit")) as [number];
  if (code !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited with code ${code}`,
    );
  }
};

/**
 * These end-to-end tests exercise the demo app in a real browser. The demo
 * app server and its dependencies are managed automatically below so the
 * tests pass with a plain `npm test`. If the demo app dependencies are not
 * installed, the tests are skipped instead of failing.
 */
describe("VizHub Runtime End to End (Web Worker, iframe)", () => {
  beforeAll(async () => {
    // Reuse a server that is already running (e.g. `npm run demo`).
    if (await isServerUp(DEMO_URL)) {
      serverAvailable = true;
    } else if (
      existsSync(join(demoAppDir, "node_modules"))
    ) {
      try {
        // The demo app consumes the built package from `dist`, so make sure
        // it is up to date before starting the dev server.
        await run("npm", ["run", "build"], process.cwd());
        server = spawn("npm", ["run", "dev"], {
          cwd: demoAppDir,
          stdio: "ignore",
          detached: true,
        });
        serverAvailable = await waitForServer(DEMO_URL);
      } catch (error) {
        console.warn(
          "[end-to-end] Could not start the demo app server:",
          error,
        );
      }
    }

    if (serverAvailable) {
      browser = await puppeteer.launch({
        args: ["--no-sandbox"],
      });
    } else {
      console.warn(
        "[end-to-end] Demo app server unavailable; skipping end-to-end tests. " +
          "Run `npm install` in demo-app or `npm run demo` to enable them.",
      );
    }
  }, 180_000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (server && server.pid) {
      // Kill the whole process group started by `npm run dev`.
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        // Process already exited.
      }
      server = null;
    }
  });

  it("should connect to demo app server", async (context) => {
    if (!serverAvailable || !browser) {
      context.skip();
    }

    const page = await browser!.newPage();

    try {
      await page.goto(DEMO_URL);

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

  it("should handle basic code changes", async (context) => {
    if (!serverAvailable) {
      context.skip();
    }

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

  it("should hot reload JS with v3 runtime", async (context) => {
    if (!serverAvailable) {
      context.skip();
    }

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

  it("should hot reload CSS with v3 runtime", async (context) => {
    if (!serverAvailable) {
      context.skip();
    }

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
