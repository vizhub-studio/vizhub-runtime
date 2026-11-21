import { createViewState } from "../createViewState.js";
import { createBrowserAdapter } from "../browserAdapter.js";
import { createIframeAdapter } from "../iframeAdapter.js";

const adapter =
  window.parent === window
    ? createBrowserAdapter()
    : createIframeAdapter();

const view = createViewState({ adapter });
// Fixture-only hook for browser protocol tests (not part of the public API).
window.__viewStateDemo = view;

function render({ year, region }) {
  document.querySelector("#year").value = year;
  document.querySelector("#region").value = region;
  document.querySelector("#selection").textContent =
    "Year: " + year + " | Region: " + region;

  const svg = document.querySelector("#chart");
  svg.replaceChildren();
  const ns = "http://www.w3.org/2000/svg";
  const offset = { US: 20, CA: 65, NY: 105 }[region] ?? 20;
  const shift = year === "2020" ? -25 : 0;

  for (let i = 0; i < 8; i++) {
    const circle = document.createElementNS(ns, "circle");
    circle.setAttribute("cx", String(30 + i * 48));
    circle.setAttribute("cy", String(155 - (i * 19 + offset + shift) % 125));
    circle.setAttribute("r", String(5 + (i % 3) * 2));
    circle.setAttribute("fill", "#3569ae");
    circle.setAttribute("opacity", "0.85");
    svg.appendChild(circle);
  }

  document.body.dataset.rendered = "true";
}

const renderFromParams = (params) => {
  const year = params.get("year") ?? "2024";
  const region = params.get("region") ?? "US";
  render({ year, region });
};

view.on("change.render", ({ params }) => renderFromParams(params));
renderFromParams(view.params());

document.querySelector("#year").addEventListener("change", (event) => {
  view.param("year", event.target.value).replace();
});

document.querySelector("#region").addEventListener("change", (event) => {
  view.param("region", event.target.value).push();
});

window.addEventListener("pagehide", () => view.destroy(), { once: true });
