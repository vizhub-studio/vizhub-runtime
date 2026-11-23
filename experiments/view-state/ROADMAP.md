# Follow-on PR plan — portable visualization view state

These are separate PRs, each targeting its repository's **main** branch.
The experimental PR1 must remain opt-in and independently reviewable.

## PR1 — this experiment (`vizhub-runtime`)

Isolated implementation and browser/unit tests of:
- D3-style `param` getter/setter chaining and `on("change.namespace")`.
- Atomic `replace`/`push` URL commits, Back/Forward subscriptions.
- Browser, iframe and host adapters with no dependencies.
- Same visualization source in standalone HTML and opaque-origin `srcdoc`.
- Narrow message port capability, allowlisted query keys and input bounds.

Gate: tests verify export independence, no iframe reload, URL preservation,
malformed input rejection, and that the existing published API is untouched.

## PR2 — extract portable open-source package

Create a small MIT-licensed repository/package with standalone ESM entry point
and optional browser/iframe/host adapters. Use browser-compatible JavaScript,
TypeScript declarations, no VizHub-specific imports, and zero runtime dependencies.
Version the event and messaging contract; write public examples and security docs.
Keep standalone builds free of unused host/iframe code. Publish only after PR1's
API is validated.

## PR3 — opt-in `@vizhub/runtime` integration

Integrate the extracted package as an explicit capability at the **shared
post-build HTML boundary** for browser preview and server-side rendering.
Bootstrap query before application code, ensure V1–V4 compatibility, never
rewrite native `history` or `location`, and leave existing viz behavior intact.
Test hot reload and renderer behavior. Include export parity tests.

## PR4 — VizHub viewer URL host

Add the host bridge to the visualization viewer, preserving app-owned
`commit`, `mode`, `file`, `tabs` and future reserved keys. Manage URL
updates without React Router loader revalidation or iframe remount. Handle
popstate and re-created iframe sessions. Reconcile anonymous cache query policy.
Test multiple simultaneous frames, invalid/untrusted messages and history state.

## PR5 — VZCode Visual Editor compatibility

Add a separate adapter for the editor's current config-patch postMessage
contract. Maintain the existing plain-object patch listener during migration.
Configuration remains persisted authoring state; URL params remain ephemeral
visitor view state. Do not conflate the two or silently write config.json.

## PR6 — HTML export and isolated public embed execution origin

Verify HTML exported to a non-VizHub HTTPS origin can load and manipulate
URL state without network access to VizHub. Then extend the separately planned
`embed.vizhub.com` Worker to permit *validated public view parameters*
in browser-facing URLs, while keeping signed compiled HTML artifact retrieval
query-free. Preserve strict route allowlists, no cookies, revocation and opaque
sandboxing. Do not treat production DNS/cutover as already complete.

## PR7 — deep unfurl and Screenshot Genie

Use commit-pinned normalized URL parameters to select initial render state
before screenshot readiness. Cache on commit, state, resolution and renderer
version. Add share-state links and Open Graph images, with bounded input,
read-only crawlers and no public unauthenticated rendering work initiation.

## Design review gates

Do not proceed to broad integration until:
1. The API is familiar to D3 users without requiring D3.
2. Standalone exported code has no VizHub dependency.
3. The sandbox remains `allow-scripts` without `allow-same-origin`.
4. URL parameter ownership and protocol bounds are demonstrably enforced.
5. The existing runtime build/test suite and VZCode editor behavior are unchanged.
