import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { injectInteractionBridge } from "./interactionBridge";
import { readFileSync } from "node:fs";
import ts from "typescript";

describe("interaction bridge in opaque-origin iframe", () => {
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    page = await browser.newPage();
    await page.setViewport({ width: 400, height: 800, hasTouch: true, isMobile: true });
  }, 30000);
  afterAll(async () => { await browser?.close(); });

  it("delivers trusted Escape and touch gestures without reloading or intercepting the viz", async () => {
    await page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><iframe id="frame" sandbox="allow-scripts" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>');
    // Exercise transpiled browser code rather than a mocked message listener.
    const source = readFileSync(new URL("./interactionBridge.ts", import.meta.url), "utf8");
    const js = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText.replace(/\bexport\s+(?=function)/g, "");
    const html = injectInteractionBridge('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;touch-action:none"><button id="focus">Focus</button><script>window.vizState=42;window.moves=0;window.addEventListener("touchmove",()=>window.moves++);</script></body></html>');
    await page.evaluate(({ js, html }) => {
      const script = document.createElement("script");
      script.textContent = js + `
        window.events = [];
        const frame = document.getElementById("frame");
        window.bridge = createInteractionBridge({
          iframe: frame,
          onEscape: () => window.events.push("escape"),
          onEdgeSwipe: edge => window.events.push(edge),
          onDismissGesture: () => window.events.push("dismiss"),
        });
        frame.srcdoc = ${JSON.stringify(html)};
        window.bridge.enable({ twoFingerSwipe: true });
      `;
      document.head.appendChild(script);
    }, { js, html });
    const frame = await (await page.$("#frame"))!.contentFrame();
    await frame!.waitForSelector("#focus");
    await frame!.click("#focus");
    // Allow the child's ready and iframe load handshake to complete.
    await page.waitForFunction(() => {
      const f = document.getElementById("frame") as HTMLIFrameElement;
      return Boolean(f.contentWindow && (window as any).bridge);
    });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => (window as any).events.includes("escape"));
    const cdp = await page.createCDPSession();
    const swipe = async (x: number, y: number, x2: number, y2: number) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x2, y: y2, id: 1 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    await swipe(10, 300, 120, 300);
    await page.waitForFunction(() => (window as any).events.includes("left"));
    await swipe(100, 300, 250, 300);
    await page.evaluate(() => (window as any).bridge.disable());
    // Synchronize through the browser event loop before input.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await page.keyboard.press("Escape");
    await swipe(10, 300, 120, 300);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await page.evaluate(() => (window as any).events)).toEqual(["escape", "left"]);
    expect(await frame!.evaluate(() => (window as any).vizState)).toBe(42);
    expect(await frame!.evaluate(() => (window as any).moves)).toBeGreaterThan(0);
    await page.evaluate(() => (window as any).bridge.cleanup());
    await cdp.detach();
  }, 30000);
});
