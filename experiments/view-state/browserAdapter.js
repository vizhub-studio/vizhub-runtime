import { cloneParams } from "./protocol.js";

/**
 * Works on any ordinary page, including a standalone exported HTML document.
 * In opaque-origin sandboxes where History API writes are denied, state remains
 * usable in memory. An optional iframe adapter enables shareable parent URLs.
 */
export function createBrowserAdapter({ windowObject = window } = {}) {
  const listeners = new Set();
  let memory = new URLSearchParams(windowObject.location.search);
  let historyWritable = true;
  let destroyed = false;

  const read = () =>
    cloneParams(
      historyWritable
        ? new URLSearchParams(windowObject.location.search)
        : memory,
    );

  const onPopState = () => {
    if (destroyed) return;
    memory = new URLSearchParams(windowObject.location.search);
    for (const listener of listeners) {
      listener({ params: cloneParams(memory), source: "history" });
    }
  };

  windowObject.addEventListener("popstate", onPopState);

  return {
    read,
    write(params, mode) {
      if (destroyed) return;
      memory = cloneParams(params);
      if (!historyWritable) return;

      const { pathname, hash } = windowObject.location;
      const query = memory.toString();
      const url = pathname + (query ? "?" + query : "") + hash;

      try {
        const method = mode === "push" ? "pushState" : "replaceState";
        // Preserve any host/framework state in the current history entry.
        windowObject.history[method](windowObject.history.state, "", url);
      } catch {
        // Sandboxed about:srcdoc documents can have opaque origins.
        historyWritable = false;
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      listeners.clear();
      windowObject.removeEventListener("popstate", onPopState);
    },
  };
}
