import {
  cloneParams,
  isProtocolMessage,
  parseBridgeQuery,
  PROTOCOL,
  PROTOCOL_VERSION,
} from "./protocol.js";

/**
 * The host grants an individual iframe a narrow capability: update explicit
 * visualization query keys. All other URL parameters, hash, and history.state
 * remain owned by the host. No VizHub-specific names or services are used.
 */
export function createHostBridge({
  iframe,
  allowedKeys,
  windowObject = window,
  onConnected = () => {},
} = {}) {
  if (!iframe?.contentWindow) {
    throw new Error("A loaded or attached iframe is required");
  }
  if (
    !Array.isArray(allowedKeys) ||
    !allowedKeys.length ||
    allowedKeys.some(
      (key) =>
        typeof key !== "string" ||
        !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key),
    )
  ) {
    throw new Error("Host must specify explicit allowed query keys");
  }

  const keys = new Set(allowedKeys);
  let port = null;
  let destroyed = false;

  const readManaged = () => {
    const all = new URLSearchParams(windowObject.location.search);
    const managed = new URLSearchParams();
    for (const [key, value] of all) {
      if (keys.has(key)) managed.append(key, value);
    }
    return managed;
  };

  const sendSnapshot = () => {
    if (!destroyed && port) {
      port.postMessage({
        protocol: PROTOCOL,
        version: PROTOCOL_VERSION,
        type: "snapshot",
        query: readManaged().toString(),
      });
    }
  };

  const onPortMessage = ({ data }) => {
    if (destroyed) return;
    if (isProtocolMessage(data, "ack")) {
      onConnected();
      return;
    }
    if (!isProtocolMessage(data, "write")) return;

    const next = parseBridgeQuery(data.query, keys);
    if (!next || (data.mode !== "push" && data.mode !== "replace")) {
      sendSnapshot();
      return;
    }

    const url = new URL(windowObject.location.href);
    for (const key of keys) url.searchParams.delete(key);
    for (const [key, value] of next) url.searchParams.append(key, value);

    const updated = url.pathname + url.search + url.hash;
    try {
      const method = data.mode === "push" ? "pushState" : "replaceState";
      windowObject.history[method](
        windowObject.history.state,
        "",
        updated,
      );
    } catch {
      // Do not grant unsafe History API access or broaden the sandbox.
    }
    sendSnapshot();
  };

  const onReady = (event) => {
    if (
      destroyed ||
      event.source !== iframe.contentWindow ||
      !isProtocolMessage(event.data, "ready")
    ) {
      return;
    }

    port?.close();
    const channel = new windowObject.MessageChannel();
    port = channel.port1;
    port.onmessage = onPortMessage;
    port.start?.();
    // Opaque-origin srcdoc iframes require targetOrigin="*". The message
    // contains only public query state and a channel for bounded operations.
    iframe.contentWindow.postMessage(
      {
        protocol: PROTOCOL,
        version: PROTOCOL_VERSION,
        type: "connect",
        query: readManaged().toString(),
      },
      "*",
      [channel.port2],
    );
  };

  windowObject.addEventListener("message", onReady);
  windowObject.addEventListener("popstate", sendSnapshot);

  return {
    read: () => cloneParams(readManaged()),
    sync: sendSnapshot,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      port?.close();
      port = null;
      windowObject.removeEventListener("message", onReady);
      windowObject.removeEventListener("popstate", sendSnapshot);
    },
  };
}
