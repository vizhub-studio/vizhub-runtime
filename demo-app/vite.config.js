import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    include: [
      // These deps are imported transitively via @vizhub/runtime
      // (sucrase → @jridgewell/trace-mapping → @jridgewell/resolve-uri)
      // and fail to load in the browser because their "browser" export
      // condition points to a UMD file without a default export.
      // Pre-bundling them ensures proper ESM compatibility.
      // Pre-bundle sucrase and its CJS dependencies for browser compatibility.
      // @vizhub/runtime imports sucrase transitively through its build plugins,
      // but since @vizhub/runtime is excluded from optimizeDeps, these transitive
      // deps would otherwise be served raw as ESM and fail because they use CJS exports.
      "sucrase",
      "ts-interface-checker",
      "lines-and-columns",
      "@jridgewell/resolve-uri",
      "@jridgewell/trace-mapping",
    ],
    exclude: [
      // Exclude Rollup v4 from being bundled,
      // because it messes up the WASM part of the build.
      "@rollup/browser",
      "@vizhub/runtime",
    ],
  },
  server: {
    fs: {
      // Allow serving files up to the repo root so that the WASM file
      // from @rollup/browser (loaded via new URL() in the parent project's
      // node_modules) can be fetched without a 403 Forbidden.
      // Allow access up to the repo root so that the @rollup/browser WASM
      // file (loaded via new URL() from the linked parent node_modules)
      // can be fetched without a 403 Forbidden.
      allow: ["..", "../..", "../../.."],
    },
  },
});
