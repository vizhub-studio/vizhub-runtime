import { createBrowserAdapter } from "./browserAdapter.js";
import { cloneParams } from "./protocol.js";

function parseTypenames(typenames) {
  if (typeof typenames !== "string") {
    throw new TypeError("Event typenames must be a string");
  }
  return typenames.trim().split(/\s+/).filter(Boolean).map((token) => {
    const match = /^(change)?(?:\.([a-zA-Z0-9_-]+))?$/.exec(token);
    if (!match || (!match[1] && !match[2])) {
      throw new Error("Unsupported view-state event: " + token);
    }
    return { type: match[1] || "", namespace: match[2] || "" };
  });
}

/**
 * D3-style setter/getter and namespaced event API.
 * Setters stage an atomic transaction; replace()/push() commit it.
 * All query values are strings (URLSearchParams semantics).
 */
export function createViewState({ adapter = createBrowserAdapter() } = {}) {
  const callbacks = new Map();
  let committed = cloneParams(adapter.read());
  let draft = cloneParams(committed);
  let destroyed = false;

  const assertActive = () => {
    if (destroyed) throw new Error("View state has been destroyed");
  };

  const notify = (previousParams, source, mode) => {
    if (previousParams.toString() === committed.toString()) return;
    for (const listener of callbacks.values()) {
      listener.call(view, {
        type: "change",
        params: cloneParams(committed),
        previousParams: cloneParams(previousParams),
        source,
        ...(mode ? { mode } : {}),
      });
    }
  };

  const unsubscribe = adapter.subscribe(({ params, source = "host" }) => {
    if (destroyed) return;
    const previous = committed;
    committed = cloneParams(params);
    draft = cloneParams(committed);
    notify(previous, source);
  });

  const commit = (mode) => {
    assertActive();
    const next = cloneParams(draft);
    if (next.toString() === committed.toString()) return view;
    adapter.write(next, mode);
    const previous = committed;
    committed = next;
    draft = cloneParams(next);
    notify(previous, "local", mode);
    return view;
  };

  const view = {
    param(name, ...values) {
      assertActive();
      if (typeof name !== "string" || !name) {
        throw new TypeError("Parameter name must be a nonempty string");
      }
      if (values.length === 0) return draft.get(name);
      if (values[0] === null) draft.delete(name);
      else draft.set(name, String(values[0]));
      return view;
    },
    params() {
      assertActive();
      return cloneParams(draft);
    },
    replace() {
      return commit("replace");
    },
    push() {
      return commit("push");
    },
    on(typenames, callback) {
      assertActive();
      const tokens = parseTypenames(typenames);
      if (arguments.length === 1) {
        const token = tokens[0];
        return token ? callbacks.get(token.namespace) : undefined;
      }
      if (callback !== null && typeof callback !== "function") {
        throw new TypeError("Listener must be a function or null");
      }
      for (const { type, namespace } of tokens) {
        if (callback === null) {
          callbacks.delete(namespace);
        } else if (type || namespace) {
          callbacks.set(namespace, callback);
        }
      }
      return view;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      callbacks.clear();
      adapter.destroy?.();
    },
  };

  return view;
}
