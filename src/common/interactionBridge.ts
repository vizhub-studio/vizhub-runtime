/** Opt-in, semantic interactions for hosted srcdoc documents. */
export type InteractionEdge = "left" | "right" | "top" | "bottom";
export type SandboxInteraction =
  | { type: "escape" }
  | { type: "edgeSwipe"; edge: InteractionEdge }
  | { type: "dismissGesture" };

export interface InteractionOptions {
  edges?: readonly InteractionEdge[];
  edgeWidth?: number;
  minSwipeDistance?: number;
  /** Minimum primary-axis / perpendicular-axis ratio. */
  directionRatio?: number;
  escape?: boolean;
  /** Opt-in two-finger parallel swipe (not a pinch). */
  twoFingerSwipe?: boolean;
}

interface Point {
  x: number;
  y: number;
}
interface GestureOptions {
  edges: readonly InteractionEdge[];
  edgeWidth: number;
  minSwipeDistance: number;
  directionRatio: number;
  escape: boolean;
  twoFingerSwipe: boolean;
}

function normalize(options: InteractionOptions = {}): GestureOptions {
  const positive = (value: number | undefined, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : fallback;
  return {
    edges: (["left", "right", "top", "bottom"] as const).filter((edge) =>
      (options.edges ?? ["left", "right", "top", "bottom"]).includes(edge),
    ),
    edgeWidth: positive(options.edgeWidth, 24),
    minSwipeDistance: positive(options.minSwipeDistance, 80),
    directionRatio: Math.max(1, positive(options.directionRatio, 1.5)),
    escape: options.escape !== false,
    twoFingerSwipe: options.twoFingerSwipe === true,
  };
}

/** Pure detector; coordinates are CSS pixels in the iframe viewport. */
export function recognizeInteractionSwipe(
  starts: readonly Point[],
  ends: readonly Point[],
  width: number,
  height: number,
  options: GestureOptions,
): SandboxInteraction | null {
  if (
    !Number.isFinite(width) || !Number.isFinite(height) ||
    width <= 0 || height <= 0 ||
    starts.length !== ends.length ||
    ![1, 2].includes(starts.length) ||
    [...starts, ...ends].some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)) ||
    starts.some((p) => p.x < 0 || p.y < 0 || p.x > width || p.y > height)
  ) return null;

  const dx = ends[0].x - starts[0].x;
  const dy = ends[0].y - starts[0].y;
  const { minSwipeDistance: distance, directionRatio: ratio, edgeWidth } = options;
  const horizontal = Math.abs(dx) >= distance && Math.abs(dx) >= Math.abs(dy) * ratio;
  const vertical = Math.abs(dy) >= distance && Math.abs(dy) >= Math.abs(dx) * ratio;
  if (!horizontal && !vertical) return null;

  if (starts.length === 2) {
    if (!options.twoFingerSwipe) return null;
    const dx2 = ends[1].x - starts[1].x;
    const dy2 = ends[1].y - starts[1].y;
    // Both fingers must travel in the same direction by similar amounts.
    // Reject pinches, rotations and asymmetric two-finger movements.
    if (Math.hypot(dx - dx2, dy - dy2) > distance / 3) return null;
    if (horizontal && (Math.sign(dx2) !== Math.sign(dx) || Math.abs(dx2) < distance)) return null;
    if (vertical && (Math.sign(dy2) !== Math.sign(dy) || Math.abs(dy2) < distance)) return null;
    return { type: "dismissGesture" };
  }

  const start = starts[0];
  const edge: InteractionEdge = horizontal
    ? dx > 0 ? "left" : "right"
    : dy > 0 ? "top" : "bottom";
  const fromEdge = edge === "left" ? start.x <= edgeWidth
    : edge === "right" ? width - start.x <= edgeWidth
    : edge === "top" ? start.y <= edgeWidth
    : height - start.y <= edgeWidth;
  return fromEdge && options.edges.includes(edge)
    ? { type: "edgeSwipe", edge }
    : null;
}

const namespace = "vizhub:interaction";
const marker = 'data-vizhub-interaction-bridge="1"';

/**
 * Runs in the sandbox, not the host. Keep self-contained: serialized into HTML.
 * Capture/passive listeners observe completed gestures without intercepting
 * chart events, suppressing defaults, or changing touch-action.
 */
function installInteractionBridge(
  recognize: typeof recognizeInteractionSwipe,
  channel: string,
) {
  if (window.parent === window) return;
  let config: GestureOptions | null = null;
  let session = "";
  let starts = new Map<number, Point>();
  let ends = new Map<number, Point>();
  let invalid = false;
  let moving = false;

  const reset = () => {
    starts = new Map();
    ends = new Map();
    invalid = false;
    moving = false;
  };
  const send = (interaction: SandboxInteraction) => {
    if (config) window.parent.postMessage({
      channel, version: 1, type: "interaction", session, interaction,
    }, "*");
  };
  const point = (touch: Touch): Point => ({ x: touch.clientX, y: touch.clientY });

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || data.channel !== channel || data.version !== 1 ||
        data.type !== "configure" || typeof data.session !== "string") return;
    session = data.session;
    config = data.options ?? null;
    reset();
  });
  const listen = { capture: true, passive: true };
  window.addEventListener("keydown", (event) => {
    if (config?.escape && event.isTrusted && !event.repeat && !event.isComposing &&
        event.key === "Escape") send({ type: "escape" });
  }, listen);
  window.addEventListener("touchstart", (event) => {
    if (!config || !event.isTrusted) return;
    if (event.touches.length === event.changedTouches.length && starts.size === 0) reset();
    if (moving || ends.size || event.touches.length > 2) invalid = true;
    for (const touch of Array.from(event.changedTouches)) {
      starts.set(touch.identifier, point(touch));
    }
    if (starts.size > 2 || starts.size !== event.touches.length) invalid = true;
  }, listen);
  window.addEventListener("touchmove", (event) => {
    if (!config || !event.isTrusted) return;
    moving = true;
    if (event.touches.length !== starts.size || event.touches.length > 2) invalid = true;
  }, listen);
  window.addEventListener("touchend", (event) => {
    if (!config || !event.isTrusted) return;
    for (const touch of Array.from(event.changedTouches)) {
      if (!starts.has(touch.identifier)) invalid = true;
      ends.set(touch.identifier, point(touch));
    }
    if (event.touches.length) return;
    if (!invalid && starts.size === ends.size && starts.size > 0) {
      const ids = Array.from(starts.keys());
      const result = recognize(
        ids.map((id) => starts.get(id)!),
        ids.map((id) => ends.get(id)!),
        window.innerWidth, window.innerHeight, config,
      );
      if (result) send(result);
    }
    reset();
  }, listen);
  window.addEventListener("touchcancel", () => reset(), listen);
  window.addEventListener("blur", reset);
  window.addEventListener("resize", reset);
  window.parent.postMessage({ channel, version: 1, type: "ready" }, "*");
}

/** Instrument already-built HTML once, before assigning srcdoc. No build or DOM required. */
export function injectInteractionBridge(html: string): string {
  if (html.includes("<script " + marker + ">")) return html;
  const script = "<script " + marker + ">(" + installInteractionBridge.toString() +
    ")(" + recognizeInteractionSwipe.toString() + "," + JSON.stringify(namespace) + ");</script>";
  // Preserve doctype and document mode, including documents without a head.
  const head = /<head(?:\s[^>]*)?>/i.exec(html);
  const root = /<html(?:\s[^>]*)?>/i.exec(html);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  const match = head ?? root ?? doctype;
  const offset = match ? match.index + match[0].length : 0;
  return html.slice(0, offset) + script + html.slice(offset);
}

export interface InteractionBridge {
  enable(options?: InteractionOptions): void;
  disable(): void;
  cleanup(): void;
}

export interface InteractionBridgeOptions {
  iframe: HTMLIFrameElement;
  onEscape?: () => void;
  onEdgeSwipe?: (edge: InteractionEdge) => void;
  onDismissGesture?: () => void;
}

/**
 * Attach before setting srcdoc. Messages are untrusted requests even after
 * checking source and session; user code shares the child's execution context.
 * This helper does not grant permissions or change fullscreen state.
 */
export function createInteractionBridge({
  iframe, onEscape, onEdgeSwipe, onDismissGesture,
}: InteractionBridgeOptions): InteractionBridge {
  const host = iframe.ownerDocument.defaultView;
  if (!host) throw new Error("Interaction bridge requires a host window");
  let config: GestureOptions | null = null;
  let session = "";
  let disposed = false;
  let revision = 0;
  const rotateSession = () => {
    session = String(++revision) + ":" + Math.random().toString(36).slice(2);
  };
  rotateSession();

  const sync = () => {
    iframe.contentWindow?.postMessage({
      channel: namespace, version: 1, type: "configure", session, options: config,
    }, "*"); // Opaque sandbox origins require wildcard targetOrigin.
  };
  const onLoad = () => {
    rotateSession();
    sync();
  };
  const onMessage = (event: MessageEvent) => {
    if (disposed || !iframe.contentWindow || event.source !== iframe.contentWindow) return;
    const data = event.data;
    if (!data || data.channel !== namespace || data.version !== 1) return;
    if (data.type === "ready") {
      sync();
      return;
    }
    if (!config || data.type !== "interaction" || data.session !== session) return;
    const interaction = data.interaction;
    if (!interaction || typeof interaction !== "object") return;
    if (interaction.type === "escape" && config.escape) onEscape?.();
    else if (interaction.type === "edgeSwipe" && config.edges.includes(interaction.edge)) {
      onEdgeSwipe?.(interaction.edge);
    } else if (interaction.type === "dismissGesture" && config.twoFingerSwipe) {
      onDismissGesture?.();
    }
  };
  host.addEventListener("message", onMessage);
  iframe.addEventListener("load", onLoad);

  return {
    enable(options) {
      if (disposed) return;
      config = normalize(options);
      rotateSession();
      sync();
    },
    disable() {
      if (disposed) return;
      config = null;
      rotateSession();
      sync();
    },
    cleanup() {
      if (disposed) return;
      config = null;
      rotateSession();
      sync();
      disposed = true;
      host.removeEventListener("message", onMessage);
      iframe.removeEventListener("load", onLoad);
    },
  };
}
