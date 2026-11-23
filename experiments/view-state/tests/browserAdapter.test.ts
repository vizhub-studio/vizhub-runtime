import { describe, expect, it, vi } from "vitest";
import { createBrowserAdapter } from "../browserAdapter.js";
import { createViewState } from "../createViewState.js";

function fakeWindow(start = "https://example.org/page?year=2024&commit=abc#chart") {
  let url = new URL(start);
  const listeners = new Map<string, Set<Function>>();
  const calls: Array<{ type: string; url: string; state: unknown }> = [];
  const state = { app: "keep-me" };

  const windowObject = {
    location: {
      get href() { return url.href; },
      get search() { return url.search; },
      get pathname() { return url.pathname; },
      get hash() { return url.hash; },
    },
    history: {
      state,
      pushState(previousState: unknown, _unused: string, target: string) {
        url = new URL(target, url);
        calls.push({ type: "push", url: url.href, state: previousState });
      },
      replaceState(previousState: unknown, _unused: string, target: string) {
        url = new URL(target, url);
        calls.push({ type: "replace", url: url.href, state: previousState });
      },
    },
    addEventListener(type: string, callback: Function) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(callback);
    },
    removeEventListener(type: string, callback: Function) {
      listeners.get(type)?.delete(callback);
    },
    dispatch(type: string) {
      for (const listener of listeners.get(type) ?? []) listener();
    },
    get listenerCount() { return listeners.get("popstate")?.size ?? 0; },
  };
  return { windowObject, calls, setUrl(next: string) { url = new URL(next); } };
}

describe("native browser History adapter", () => {
  it("preserves hash, unrelated query keys and history.state", () => {
    const fake = fakeWindow();
    const adapter = createBrowserAdapter({ windowObject: fake.windowObject as any });
    const view = createViewState({ adapter });
    view.param("year", "2020").replace();
    view.param("region", "CA").push();

    expect(fake.calls.map((call) => call.type)).toEqual(["replace", "push"]);
    expect(fake.calls[1].url).toBe(
      "https://example.org/page?year=2020&commit=abc&region=CA#chart",
    );
    expect(fake.calls.every((call) => call.state === fake.windowObject.history.state))
      .toBe(true);

    const callback = vi.fn();
    view.on("change.test", callback);
    fake.setUrl("https://example.org/page?year=2024&commit=abc#chart");
    fake.windowObject.dispatch("popstate");
    expect(view.param("year")).toBe("2024");
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0].source).toBe("history");
    view.destroy();
    expect(fake.windowObject.listenerCount).toBe(0);
  });

  it("degrades to local memory when sandboxed history writes throw", () => {
    const fake = fakeWindow();
    fake.windowObject.history.replaceState = () => {
      throw new DOMException("History denied", "SecurityError");
    };
    const adapter = createBrowserAdapter({ windowObject: fake.windowObject as any });
    const view = createViewState({ adapter });
    expect(() => view.param("year", "2020").replace()).not.toThrow();
    expect(view.param("year")).toBe("2020");
    expect(adapter.read().get("year")).toBe("2020");
    expect(fake.windowObject.location.search).toContain("year=2024");
    view.destroy();
  });
});
