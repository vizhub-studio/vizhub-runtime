import { VizHubRuntimeFixture } from "./types";

export const reactD3Combo: VizHubRuntimeFixture = {
  label: "React + D3 Combo",
  status: "working",
  files: {
    "index.html": `
<!DOCTYPE html>
<html>
  <head>
    <title>React + D3 Demo</title>
    <script type="importmap">
      {
        "imports": {
          "react": "https://cdn.jsdelivr.net/npm/react@19.1.0/+esm",
          "react/jsx-runtime": "https://cdn.jsdelivr.net/npm/react@19.1.0/jsx-runtime/+esm",
          "react-dom/client": "https://cdn.jsdelivr.net/npm/react-dom@19.1.0/client/+esm",
          "d3": "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm"
        }
      }
    </script>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="index.jsx"></script>
  </body>
</html>
  `,
    "index.jsx": `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
const root = createRoot(document.getElementById('root'));
root.render(<App />);
  `,
    "App.jsx": `
import React, { useRef, useEffect } from 'react';
import { select } from 'd3';
import { data } from './data.js';
import { viz } from './viz.js';

export const App = () => {
  const ref = useRef(null);

  useEffect(() => {
    const container = ref.current.parentElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    viz(select(ref.current), { data, width, height });
  }, []);

  return (
    <div className="container">
      <svg ref={ref}></svg>
    </div>
  );
};
  `,
    "data.js": `
export const data = [
  { x: 100, y: 438 },
  { x: 300, y: 305 },
  { x: 500, y: 300 },
  { x: 700, y: 200 },
  { x: 837, y: 135 },
];
  `,
    "styles.css": `
body {
  margin: 0;
  overflow: hidden;
}

.container {
  width: 100vw;
  height: 100vh;
}
  `,
    "viz.js": `
import { renderCircles } from './renderCircles.js';

export const viz = (svg, { data, width, height }) => {
  svg.attr('width', width).attr('height', height);
  renderCircles(svg, { data });
};
  `,
    "renderCircles.js": `
export const renderCircles = (selection, { data }) => {
  selection
    .selectAll('circle')
    .data(data)
    .join('circle')
    .attr('cx', (d) => d.x)
    .attr('cy', (d) => d.y)
    .attr('r', 30);
};
  `,
  },
};
