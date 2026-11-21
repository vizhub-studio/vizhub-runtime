// Transport-only primitives. This module is intentionally independent of VizHub.
export const PROTOCOL = "portable-view-state";
export const PROTOCOL_VERSION = 1;
export const MAX_QUERY_LENGTH = 2048;
export const MAX_QUERY_PAIRS = 32;

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

/**
 * Parse only bounded, non-privileged query parameters received over the bridge.
 * Returns null on invalid input instead of throwing inside message handlers.
 */
export function parseBridgeQuery(query, allowedKeys) {
  if (typeof query !== "string" || query.length > MAX_QUERY_LENGTH) {
    return null;
  }

  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  let count = 0;
  for (const [key, value] of params) {
    count += 1;
    if (
      count > MAX_QUERY_PAIRS ||
      !KEY_PATTERN.test(key) ||
      value.length > 512 ||
      (allowedKeys && !allowedKeys.has(key))
    ) {
      return null;
    }
  }
  return params;
}

export function isProtocolMessage(value, type) {
  return (
    value !== null &&
    typeof value === "object" &&
    value.protocol === PROTOCOL &&
    value.version === PROTOCOL_VERSION &&
    value.type === type
  );
}

export function cloneParams(params) {
  return new URLSearchParams(params);
}
