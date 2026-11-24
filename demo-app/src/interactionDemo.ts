import {
  createInteractionBridge,
  injectInteractionBridge,
} from "@vizhub/runtime";

const stage =
  document.querySelector<HTMLDivElement>("#stage")!;
const iframe = stage.querySelector("iframe")!;
const enter =
  document.querySelector<HTMLButtonElement>("#enter")!;
const status =
  document.querySelector<HTMLParagraphElement>("#status")!;
let active = false;
let previousOverflow = "";
function exit(reason: string) {
  if (!active) return;
  active = false;
  bridge.disable();
  stage.classList.remove("active");
  document.body.style.overflow = previousOverflow;
  status.textContent = "Exited via " + reason;
  enter.focus();
}
const bridge = createInteractionBridge({
  iframe,
  onEscape: () => exit("Escape"),
  onEdgeSwipe: (edge) => exit(edge + " edge swipe"),
  onDismissGesture: () => exit("two-finger swipe"),
});
iframe.srcdoc =
  injectInteractionBridge(`<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;width:100%;height:100%;background:#172133;color:white}svg{width:100%;height:100%;touch-action:none;display:block}</style>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
</head><body><svg viewBox="0 0 400 400" aria-label="Zoomable scatterplot"></svg>
<script>
const svg = d3.select("svg");
const layer = svg.append("g");
layer.selectAll("circle").data(d3.range(180)).join("circle")
  .attr("cx", i => 200 + 160 * Math.sin(i * 2.4) * Math.sqrt(i / 180))
  .attr("cy", i => 200 + 160 * Math.cos(i * 2.4) * Math.sqrt(i / 180))
  .attr("r", 4).attr("fill", i => d3.interpolateCool(i / 180));
svg.call(d3.zoom().scaleExtent([0.5, 8]).on("zoom", e => layer.attr("transform", e.transform)));
</script></body></html>`);
enter.addEventListener("click", () => {
  if (active) return;
  active = true;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  stage.classList.add("active");
  bridge.enable({ twoFingerSwipe: true });
  iframe.focus();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") exit("Escape");
});
window.addEventListener(
  "pagehide",
  () => bridge.cleanup(),
  { once: true },
);
