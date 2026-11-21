import { describe, expect, it, vi } from "vitest";
import { createViewState } from "../createViewState.js";

const createMemoryAdapter = (query = "") => {
  let current = new URLSearchParams(query);
  let listener: ((event: any) => void) | null = null;
  const writes: Array<{ query: string; mode: string }> = [];
  let disposed = false;

  return {
    writes,
    read: () => new URLSearchParams(current),
    write(params: URLSearchParams, mode: string) {
      current = new URLSearchParams(params);
      writes.push({ query: current.toString(), mode });
    },
    subscribe(callback: (event: any) => void) {
      listener = callback;
      return () => { listener = null; };
    },
    external(query: string, source = "history") {
      current = new URLSearchParams(query);
      listener?.({ params: new URLSearchParams(current), source });
    },
    destroy() { disposed = true; },
    get disposed() { return disposed; },
  };
};

describe("portable D3-style view state", () => {
  it("stages chained setters as one URL transaction", () => {
    const adapter = createMemoryAdapter("year=2024");
    const view = createViewState({ adapter });
    const change = vi.fn();
    view.on("change.render", change);

    expect(view.param("year")).toBe("2024");
    expect(view.param("year", "2020")).toBe(view);
    expect(view.param("region", "CA")).toBe(view);
    expect(adapter.writes).toHaveLength(0);
    expect(view.replace()).toBe(view);
    expect(adapter.writes).toEqual([
      { query: "year=2020&region=CA", mode: "replace" },
    ]);
    expect(change).toHaveBeenCalledTimes(1);
    expect(change.mock.calls[0][0].source).toBe("local");
    expect(change.mock.calls[0][0].params.get("year")).toBe("2020");

    view.replace(); // no-op, no redundant History API write
    expect(adapter.writes).toHaveLength(1);
    expect(change).toHaveBeenCalledTimes(1);
    view.destroy();
  });

  it("supports push, deletions, defensive snapshots and external navigation", () => {
    const adapter = createMemoryAdapter("year=2020&region=CA");
    const view = createViewState({ adapter });
    const changes: any[] = [];
    view.on("change.render", (event: any) => changes.push(event));

    view.param("region", null).push();
    expect(adapter.writes[0]).toEqual({ query: "year=2020", mode: "push" });
    const copy = view.params();
    copy.set("year", "malicious");
    expect(view.param("year")).toBe("2020");

    adapter.external("year=2024&region=NY");
    expect(view.param("year")).toBe("2024");
    expect(changes[1].source).toBe("history");
    expect(changes[1].previousParams.get("year")).toBe("2020");
    expect(changes[1].params.get("region")).toBe("NY");
    view.destroy();
    expect(adapter.disposed).toBe(true);
  });

  it("matches D3-style namespaced callback replacement and removal", () => {
    const adapter = createMemoryAdapter();
    const view = createViewState({ adapter });
    const a = vi.fn();
    const replacement = vi.fn();
    const b = vi.fn();

    expect(view.on("change.render", a)).toBe(view);
    expect(view.on("change.log", b)).toBe(view);
    expect(view.on("change.render")).toBe(a);
    view.on("change.render", replacement);
    expect(view.on("change.render")).toBe(replacement);

    view.param("year", 2020).replace();
    expect(a).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    view.on(".render", null);
    view.param("year", 2024).replace();
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);

    view.on("change.log", null);
    view.param("year", 2020).replace();
    expect(b).toHaveBeenCalledTimes(2);
    view.destroy();
  });

  it("rejects unsupported events and cleans up listeners", () => {
    const adapter = createMemoryAdapter();
    const view = createViewState({ adapter });
    expect(() => view.on("click.render", () => {})).toThrow();
    expect(() => view.on("change.render", "no" as any)).toThrow();
    view.destroy();
    expect(() => view.param("year")).toThrow("destroyed");
    expect(() => view.replace()).toThrow("destroyed");
  });
});
