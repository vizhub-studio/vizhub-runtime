# Portable visualization view state — isolated proof of concept

This experiment is **not** part of the published `@vizhub/runtime` entry point.
No production runtime code is modified, and there are **zero new dependencies**.
The JavaScript files can be copied alongside exported HTML; they require no
VizHub account, API, domain, authentication, or runtime implementation.

## Why

Visualization URL parameters such as `?year=2020&region=CA` should remain useful
after the visualization is exported. Native browser history works in standalone
HTML, but a `sandbox="allow-scripts"` `srcdoc` iframe has an opaque origin and
cannot reliably change its document URL. A small, optional iframe adapter asks
its host to change the host page's URL instead. Both use the same state API.

The shape is familiar to users of D3 setters and `d3.dispatch`, but there is
no D3 or `d3-dispatch` dependency:

```js
import { createViewState } from "./createViewState.js";

const view = createViewState()
  .on("change.render", ({ params }) => {
    render({
      year: +(params.get("year") ?? 2024),
      region: params.get("region") ?? "US",
    });
  });

// Initial render is explicit; .on() does not replay state.
renderFromParams(view.params());

// Chained setters form one atomic URL-history transaction.
view.param("year", "2020").param("region", "CA").replace();
view.param("region", "NY").push();

// D3-like namespace operations.
const renderListener = view.on("change.render");
view.on(".render", null);
view.destroy();
```

`param(name)` reads a string or null; `param(name, value)` sets a string
and returns the controller; `param(name, null)` deletes. `params()` returns
a defensive `URLSearchParams` copy. `replace()` updates one browser-history
entry; `push()` adds a navigation entry. Both commit staged changes once and
emit `change` only if the serialized query changed. `change` receives
`{type, params, previousParams, source, mode?}` with `source` one of
`local`, `history`, or `host`. There is no implicit serialization of D3,
React or editor state.

## Try the two fixtures

Start the zero-dependency fixture server from the repository root:

```bash
node experiments/view-state/serve.mjs
```

Then open:

- `http://127.0.0.1:3002/experiments/view-state/fixtures/standalone.html?year=2020&region=CA`
- `http://127.0.0.1:3002/experiments/view-state/fixtures/embedded-host.html?year=2020&region=CA&commit=abc`

Both modes import the **same** `fixtures/visualization.js`. Changing Year
uses `replace()`, changing Region uses `push()`. Try browser Back/Forward.

The host uses:

```js
const bridge = createHostBridge({
  iframe,
  allowedKeys: ["year", "region"],
});
```

For `srcdoc`, the host includes the initial URL query via a
`<meta name="view-state-query" content="year=2020&amp;region=CA">` element
**before visualization JavaScript runs**. The iframe uses
`createIframeAdapter()`; standalone HTML uses `createBrowserAdapter()`.
This is an explicit adapter selection in the demo, not automatic detection by
the state engine.

Because the sandbox is opaque-origin, static servers hosting the ES modules
must supply `Access-Control-Allow-Origin: *` for the sandbox's JavaScript
module requests. The test server does this. The production runtime's inline
bundling could avoid those module fetches, but that is out of scope here.

## Tests

From the repository root:

```bash
npx vitest run experiments/view-state/tests
```

The browser test launches its own ephemeral HTTP server and Chromium through
the **existing** Puppeteer development dependency; it does not require
`npm run demo`. It verifies standalone HTML, sandboxed `srcdoc`, URL
navigation and a disconnected sandbox. There are unit tests for method
chaining, namespaced callbacks, URL preservation, fallback and protocol bounds.

## Security and constraints

- Only explicit `allowedKeys` are writable by a host iframe. All other host
  URL parameters, fragment and existing `history.state` are preserved.
- The host verifies `event.source === iframe.contentWindow` before granting
  each unique transferred `MessagePort`. The child verifies its actual parent.
- The initial `postMessage` uses `targetOrigin="*"` because opaque-origin
  documents cannot be addressed by a concrete origin. It transfers only a
  constrained query-state capability, not general RPC or privileged actions.
- Bridge queries are capped at 2048 serialized characters, 32 key/value
  pairs, 64-character ASCII keys and 512-character decoded values. Invalid
  messages are rejected; host state remains authoritative.
- A disconnected sandbox remains interactive in memory, though it cannot
  create shareable host URLs. Ordinary standalone pages use native history.
- The protocol does not grant DOM access, `allow-same-origin`, file writes,
  config changes, authentication, or network capabilities.
- Avoid secrets in query strings. Add explicit ownership/routing policies when
  the actual VizHub viewer integrates this proof of concept.

## Non-goals

This PR does **not** add exports to `src/index.ts`, modify runtime V1–V4
builds, alter VizHub viewer routing, integrate VZCode, enable `embed.vizhub.com`,
build screenshots, or publish an npm package.

See [ROADMAP.md](./ROADMAP.md) for the follow-on PR sequence.
