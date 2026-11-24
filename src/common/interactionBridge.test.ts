import { describe, expect, it, vi } from "vitest";
import {
  createInteractionBridge,
  injectInteractionBridge,
  recognizeInteractionSwipe,
  type InteractionEdge,
} from "./interactionBridge";

const edges = ["left", "right", "top", "bottom"] as const;
const config = {
  edges, edgeWidth: 24, minSwipeDistance: 80, directionRatio: 1.5,
  escape: true, twoFingerSwipe: true,
};
const p = (x: number, y: number) => ({ x, y });
const swipe = (a: ReturnType<typeof p>[], b: ReturnType<typeof p>[]) =>
  recognizeInteractionSwipe(a, b, 400, 800, config);

describe("interaction gesture recognition", () => {
  it.each([
    ["left", p(10, 300), p(110, 310)],
    ["right", p(390, 300), p(280, 310)],
    ["top", p(200, 10), p(210, 120)],
    ["bottom", p(200, 790), p(210, 680)],
  ] as const)("recognizes inward swipe from %s", (edge, start, end) => {
    expect(swipe([start], [end])).toEqual({ type: "edgeSwipe", edge });
  });

  it.each([
    [p(100, 300), p(250, 300)], // central drag
    [p(10, 300), p(20, 300)], // short swipe
    [p(10, 300), p(110, 400)], // diagonal
    [p(10, 300), p(-100, 300)], // outward
    [p(10, 300), p(10, 300)], // tap
    [p(10, 300), p(NaN, 300)],
  ])("rejects non-dismissal gesture %#", (start, end) => {
    expect(swipe([start], [end])).toBeNull();
  });

  it("recognizes a parallel two-finger swipe but not a pinch or rotation", () => {
    const starts = [p(100, 200), p(150, 200)];
    expect(swipe(starts, [p(210, 200), p(260, 205)])).toEqual({ type: "dismissGesture" });
    expect(swipe(starts, [p(10, 200), p(260, 200)])).toBeNull();
    expect(swipe(starts, [p(210, 200), p(150, 310)])).toBeNull();
    expect(recognizeInteractionSwipe(starts, [p(210, 200), p(260, 200)], 400, 800,
      { ...config, twoFingerSwipe: false })).toBeNull();
    expect(swipe([...starts, p(300, 300)], [p(210, 200), p(260, 200), p(390, 300)])).toBeNull();
  });

  it("honors selected edges and thresholds", () => {
    expect(recognizeInteractionSwipe([p(10, 300)], [p(110, 300)], 400, 800,
      { ...config, edges: ["right"] })).toBeNull();
    expect(recognizeInteractionSwipe([p(10, 300)], [p(110, 300)], 400, 800,
      { ...config, minSwipeDistance: 120 })).toBeNull();
  });
});

describe("interaction instrumentation", () => {
  it.each([
    "<!doctype html><html><head lang='en'></head><body></body></html>",
    "<!DOCTYPE html><html><body></body></html>",
    "<!doctype html><p>hello</p>",
    "<p>hello</p>",
  ])("instruments once and preserves original markup", (html) => {
    const result = injectInteractionBridge(html);
    expect(result).toContain('data-vizhub-interaction-bridge="1"');
    expect(result.replace(/<script data-vizhub-interaction-bridge="1">[\s\S]*?<\/script>/, "")).toBe(html);
    expect(injectInteractionBridge(result)).toBe(result);
    if (/^<!doctype/i.test(html)) expect(result).toMatch(/^<!doctype html>/i);
  });
});

describe("host interaction bridge", () => {
  function setup() {
    const host = new EventTarget();
    const frame = new EventTarget();
    const child = { postMessage: vi.fn() };
    const iframe = Object.assign(frame, {
      contentWindow: child,
      ownerDocument: { defaultView: host },
    }) as unknown as HTMLIFrameElement;
    const onEscape = vi.fn();
    const onEdgeSwipe = vi.fn<(edge: InteractionEdge) => void>();
    const onDismissGesture = vi.fn();
    const bridge = createInteractionBridge({ iframe, onEscape, onEdgeSwipe, onDismissGesture });
    const configMessage = () => child.postMessage.mock.calls.at(-1)?.[0];
    const send = (data: unknown, source: unknown = child) => {
      const event = Object.assign(new Event("message"), { source, data });
      host.dispatchEvent(event);
    };
    const message = (interaction: unknown, session = configMessage()?.session) => ({
      channel: "vizhub:interaction", version: 1, type: "interaction", session, interaction,
    });
    return { bridge, frame, child, send, message, configMessage, onEscape, onEdgeSwipe, onDismissGesture };
  }

  it("defaults to disabled, checks source/version/session and ignores malformed requests", () => {
    const s = setup();
    s.send(s.message({ type: "escape" }));
    expect(s.onEscape).not.toHaveBeenCalled();
    s.bridge.enable({ edges: ["left"] });
    s.send(s.message({ type: "escape" }), {});
    s.send({ ...s.message({ type: "escape" }), version: 2 });
    s.send(s.message({ type: "escape" }, "stale"));
    s.send(s.message(null));
    s.send(s.message({ type: "edgeSwipe", edge: "right" }));
    s.send(s.message({ type: "dismissGesture" }));
    expect(s.onEscape).not.toHaveBeenCalled();
    expect(s.onEdgeSwipe).not.toHaveBeenCalled();
    expect(s.onDismissGesture).not.toHaveBeenCalled();
    s.send(s.message({ type: "escape" }));
    s.send(s.message({ type: "edgeSwipe", edge: "left" }));
    expect(s.onEscape).toHaveBeenCalledOnce();
    expect(s.onEdgeSwipe).toHaveBeenCalledWith("left");
    s.bridge.cleanup();
  });

  it("resynchronizes on ready/load, invalidates old sessions and disposes listeners", () => {
    const s = setup();
    s.bridge.enable({ escape: false, twoFingerSwipe: true });
    const old = s.configMessage().session;
    s.send({ channel: "vizhub:interaction", version: 1, type: "ready" });
    expect(s.configMessage().session).toBe(old);
    s.frame.dispatchEvent(new Event("load"));
    expect(s.configMessage().session).not.toBe(old);
    s.send(s.message({ type: "dismissGesture" }, old));
    expect(s.onDismissGesture).not.toHaveBeenCalled();
    s.send(s.message({ type: "dismissGesture" }));
    s.send(s.message({ type: "escape" }));
    expect(s.onDismissGesture).toHaveBeenCalledOnce();
    expect(s.onEscape).not.toHaveBeenCalled();
    s.bridge.disable();
    s.send(s.message({ type: "dismissGesture" }));
    expect(s.onDismissGesture).toHaveBeenCalledOnce();
    s.bridge.cleanup();
    const count = s.child.postMessage.mock.calls.length;
    s.frame.dispatchEvent(new Event("load"));
    s.bridge.enable();
    s.bridge.cleanup();
    expect(s.child.postMessage.mock.calls).toHaveLength(count);
  });
});
