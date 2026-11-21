import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import puppeteer, { type Browser } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const prefix = "/experiments/view-state/";
const root = fileURLToPath(new URL("../", import.meta.url));
let server: Server;
let browser: Browser;
let base: string;

beforeAll(async () => {
  // Unlike the existing runtime E2E suite, this fixture starts its own server.
  server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || "/", "http://localhost").pathname;
      if (!pathname.startsWith(prefix)) {
        response.writeHead(404).end();
        return;
      }
      const relative = decodeURIComponent(pathname.slice(prefix.length));
      const file = resolve(root, relative);
      if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) {
        response.writeHead(403).end();
        return;
      }
      const content = await readFile(file);
      response.writeHead(200, {
        "Content-Type": extname(file) === ".html"
          ? "text/html; charset=utf-8"
          : "text/javascript; charset=utf-8",
        // Required for script modules in opaque-origin sandboxed srcdoc.
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = "http://127.0.0.1:" + (server.address() as AddressInfo).port + prefix;
  browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}, 30000);

afterAll(async () => {
  await browser?.close();
  if (server) {
    await new Promise<void>((done) => server.close(() => done()));
  }
}, 30000);

describe("portable view-state browser proof of concept", () => {
  it("runs standalone with a shareable URL and no VizHub network access", async () => {
    const page = await browser.newPage();
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    try {
      await page.goto(base + "fixtures/standalone.html?year=2020&region=CA");
      await page.waitForFunction(
        () => document.body.dataset.rendered === "true",
      );
      expect(await page.$eval("#selection", (el) => el.textContent))
        .toContain("Year: 2020 | Region: CA");

      await page.select("#region", "NY");
      await page.waitForFunction(
        () => new URL(location.href).searchParams.get("region") === "NY",
      );
      await page.evaluate(() => history.back());
      await page.waitForFunction(
        () => new URL(location.href).searchParams.get("region") === "CA",
      );
      expect(await page.$eval("#selection", (el) => el.textContent))
        .toContain("Region: CA");
      const allowedOrigin = new URL(base).origin;
      expect(requests.every((url) => new URL(url).origin === allowedOrigin))
        .toBe(true);
    } finally {
      await page.close();
    }
  }, 30000);

  it("synchronizes an opaque-origin srcdoc iframe without reload or changing host parameters", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(
        base + "fixtures/embedded-host.html?year=2020&region=CA&commit=abc",
      );
      await page.waitForFunction(
        () => document.body.dataset.connected === "true",
      );
      const frame = page.frames().find(
        (candidate) => candidate.parentFrame() === page.mainFrame(),
      );
      if (!frame) throw new Error("Sandboxed iframe was not created");
      await frame.waitForFunction(
        () => document.body.dataset.rendered === "true",
      );
      expect(await frame.$eval("#selection", (el) => el.textContent))
        .toContain("Year: 2020 | Region: CA");

      const frameLoads = await page.evaluate(() => (window as any).__frameLoads);
      await frame.select("#year", "2024");
      await page.waitForFunction(
        () => new URL(location.href).searchParams.get("year") === "2024",
      );
      await frame.select("#region", "NY");
      await page.waitForFunction(
        () => new URL(location.href).searchParams.get("region") === "NY",
      );
      expect(await page.evaluate(
        () => new URL(location.href).searchParams.get("commit"),
      )).toBe("abc");

      await page.evaluate(() => history.back());
      await page.waitForFunction(
        () => new URL(location.href).searchParams.get("region") === "CA",
      );
      await frame.waitForFunction(
        () => document.querySelector("#selection")?.textContent?.includes("Region: CA"),
      );
      expect(await page.evaluate(() => (window as any).__frameLoads))
        .toBe(frameLoads);
      const sandbox = await page.$eval("#viz-frame", (el) =>
        el.getAttribute("sandbox"),
      );
      expect(sandbox).toBe("allow-scripts");
    } finally {
      await page.close();
    }
  }, 30000);

  it("keeps rendering in an iframe with no host adapter", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(base + "fixtures/standalone.html?year=2024");
      await page.evaluate(async () => {
        const template = await fetch("./embedded-viz.html").then((r) => r.text());
        const iframe = document.createElement("iframe");
        iframe.id = "orphan";
        iframe.setAttribute("sandbox", "allow-scripts");
        iframe.srcdoc = template.replace("__INITIAL_QUERY__", "year=2020");
        document.body.appendChild(iframe);
      });
      const frame = page.frames().find(
        (candidate) => candidate.parentFrame() === page.mainFrame(),
      );
      if (!frame) throw new Error("Orphan iframe was not created");
      await frame.waitForFunction(
        () => document.body.dataset.rendered === "true",
      );
      await frame.select("#region", "NY");
      await frame.waitForFunction(
        () => document.querySelector("#selection")?.textContent?.includes("Region: NY"),
      );
      expect(await page.evaluate(
        () => new URL(location.href).searchParams.get("year"),
      )).toBe("2024");
      expect(await page.evaluate(
        () => new URL(location.href).searchParams.has("region"),
      )).toBe(false);
    } finally {
      await page.close();
    }
  }, 30000);

  it("rejects non-allowlisted writes and does not grant a neighboring iframe access", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(
        base + "fixtures/embedded-host.html?year=2020&region=CA&commit=abc",
      );
      await page.waitForFunction(
        () => document.body.dataset.connected === "true",
      );
      const legitimate = page.frames().find(
        (candidate) => candidate.parentFrame() === page.mainFrame(),
      );
      if (!legitimate) throw new Error("Sandboxed iframe was not created");
      await legitimate.waitForFunction(
        () => document.body.dataset.rendered === "true",
      );

      // The child can request only the host's allowlisted keys. The host
      // rejects a forged commit parameter and restores the authoritative view.
      await legitimate.evaluate(() => {
        (window as any).__viewStateDemo.param("commit", "forged").push();
      });
      await legitimate.waitForFunction(
        () => !(window as any).__viewStateDemo.params().has("commit"),
      );
      expect(await page.evaluate(
        () => new URL(location.href).searchParams.get("commit"),
      )).toBe("abc");

      // Another iframe cannot hijack the legitimate iframe's MessagePort:
      // the host checks event.source against its registered contentWindow.
      await page.evaluate(() => {
        const rogue = document.createElement("iframe");
        rogue.id = "rogue";
        rogue.setAttribute("sandbox", "allow-scripts");
        rogue.srcdoc = `<script>
          parent.postMessage({
            protocol: "portable-view-state", version: 1, type: "ready"
          }, "*");
          parent.postMessage({
            protocol: "portable-view-state", version: 1,
            type: "write", mode: "push", query: "year=2099"
          }, "*");
        </script>`;
        document.body.appendChild(rogue);
      });
      await page.waitForFunction(
        () => document.querySelector("#rogue")?.contentWindow !== null,
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(await page.evaluate(
        () => new URL(location.href).searchParams.get("year"),
      )).toBe("2020");

      // The authorized iframe retains its own working connection.
      await legitimate.select("#year", "2024");
      await page.waitForFunction(
        () => new URL(location.href).searchParams.get("year") === "2024",
      );
    } finally {
      await page.close();
    }
  }, 30000);
});
