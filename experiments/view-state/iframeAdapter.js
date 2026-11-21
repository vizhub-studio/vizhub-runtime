import {
  cloneParams,
  isProtocolMessage,
  parseBridgeQuery,
  PROTOCOL,
  PROTOCOL_VERSION,
} from "./protocol.js";

/**
 * A sandbox-safe adapter with no dependency on any particular host.
 * The parent offers a MessagePort capability after the child signals readiness.
 * Without a parent, URL-like state continues to work in memory.
 */
export function createIframeAdapter({
  windowObject = window,
  initialSearch,
  parentOrigin,
} = {}) {
  const metaSearch = windowObject.document.querySelector(
    'meta[name="view-state-query"]',
  )?.content;
  let memory =
    parseBridgeQuery(initialSearch ?? metaSearch ?? windowObject.location.search) ??
    new URLSearchParams();
  const listeners = new Set();
  let port = null;
  let queuedWrite = null;
  let destroyed = false;

  const receiveSnapshot = (query) => {
    const next = parseBridgeQuery(query);
    if (!next) return;
    memory = next;
    for (const listener of listeners) {
      listener({ params: cloneParams(memory), source: "host" });
    }
  };

  const onPortMessage = ({ data }) => {
    if (destroyed || !isProtocolMessage(data, "snapshot")) return;
    receiveSnapshot(data.query);
  };

  const onConnect = (event) => {
    if (
      destroyed ||
      event.source !== windowObject.parent ||
      (parentOrigin && event.origin !== parentOrigin) ||
      !isProtocolMessage(event.data, "connect") ||
      !event.ports?.[0]
    ) {
      return;
    }

    const next = parseBridgeQuery(event.data.query);
    if (!next) return;

    port?.close();
    port = event.ports[0];
    port.onmessage = onPortMessage;
    port.start?.();

    // If a user interacted before connection, preserve their latest edit.
    if (!queuedWrite) receiveSnapshot(event.data.query);
    port.postMessage({
      protocol: PROTOCOL,
      version: PROTOCOL_VERSION,
      type: "ack",
    });
    if (queuedWrite) {
      port.postMessage(queuedWrite);
      queuedWrite = null;
    }
  };

  windowObject.addEventListener("message", onConnect);
  if (windowObject.parent !== windowObject) {
    windowObject.parent.postMessage(
      { protocol: PROTOCOL, version: PROTOCOL_VERSION, type: "ready" },
      "*",
    );
  }

  return {
    read() {
      return cloneParams(memory);
    },
    write(params, mode) {
      if (destroyed) return;
      const query = params.toString();
      const next = parseBridgeQuery(query);
      if (!next) {
        throw new Error("View-state URL query exceeds the bridge limits");
      }
      memory = next;
      const message = {
        protocol: PROTOCOL,
        version: PROTOCOL_VERSION,
        type: "write",
        mode,
        query,
      };
      if (port) port.postMessage(message);
      else queuedWrite = message;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      listeners.clear();
      port?.close();
      port = null;
      windowObject.removeEventListener("message", onConnect);
    },
  };
}
