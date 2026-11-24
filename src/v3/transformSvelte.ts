import type { InputPluginOption } from "rollup";
import { parseId } from "./parseId";
import type { ResolvedVizFileId } from "./types";

const debug = false;

// The cache of fetched files.
const fetchedFileCache = new Map<string, string>();

// Cache for resolved svelte import paths to avoid repeated HTTP requests
const svelteImportCache = new Map<string, string>();

// The Svelte compiler.
export type SvelteCompiler = (
  code: string,
  options: any,
) => {
  js: { code: string; map?: object };
  css?: { code: string; map?: object } | null;
};
let compile: SvelteCompiler;

const svelteURL =
  "https://cdn.jsdelivr.net/npm/svelte@5.59.1";

export const svelteCompilerUrl = `${svelteURL}/compiler/index.js`;

/**
 * Tries to resolve a svelte import path by testing different suffixes.
 * Similar to the resolve function in the alias plugin reference.
 */
async function resolveSvelteImport(
  basePath: string,
): Promise<string> {
  // Check cache first
  const cached = svelteImportCache.get(basePath);
  if (cached) {
    return cached;
  }

  const suffixes = [".js", "/index.js"];

  for (const suffix of suffixes) {
    const url = `${basePath}${suffix}`;
    try {
      // Make a HEAD request to check if the file exists without downloading it
      const response = await fetch(url, { method: "HEAD" });
      if (response.ok) {
        // Cache the successful resolution
        svelteImportCache.set(basePath, url);
        return url;
      }
    } catch (error) {
      // Continue to next suffix if this one fails
      continue;
    }
  }

  // If none of the suffixes work, return the original .js version as fallback
  const fallback = `${basePath}.js`;
  svelteImportCache.set(basePath, fallback);
  return fallback;
}

// Responsible for transforming Svelte files.
// Inspired by:
//  * https://github.com/sveltejs/sites/blob/master/packages/repl/src/lib/workers/compiler/index.js#L2
//  * https://github.com/sveltejs/sites/blob/master/packages/repl/src/lib/workers/bundler/index.js#L358
//  * https://github.com/sveltejs/rollup-plugin-svelte/blob/master/index.js#L146C4-L146C51
export const transformSvelte = ({
  getSvelteCompiler,
}: {
  getSvelteCompiler?: () => Promise<any>;
}): InputPluginOption => ({
  name: "transformSvelte",

  load: async (resolved: string) => {
    // Handle virtual esm-env module
    if (resolved === "virtual:esm-env") {
      return `
export const BROWSER = true;
export const DEV = true;
export const NODE = false;
export const PROD = false;
`;
    }

    if (!resolved.startsWith(svelteURL)) {
      return;
    }
    if (debug) {
      console.log("[transformSvelte]: load() " + resolved);
    }

    const cachedFile = fetchedFileCache.get(resolved);
    if (cachedFile) return cachedFile;

    const fetchedFile = await fetch(resolved).then((res) =>
      res.text(),
    );

    fetchedFileCache.set(resolved, fetchedFile);

    return fetchedFile;
  },

  // From https://github.com/sveltejs/sites/blob/master/packages/repl/src/lib/workers/bundler/index.js#L255C2-L271C5
  resolveId: async (importee, importer) => {
    if (debug) {
      console.log(
        "[transformSvelte] resolveId() " + importee,
      );
      console.log("importee: " + importee);
      console.log("importer: " + importer);
    }

    // Special case for esm-env - provide browser environment constants
    if (importee === "esm-env") {
      return "virtual:esm-env";
    }

    // importing from Svelte
    if (importee === `svelte`) {
      return `${svelteURL}/src/index-client.js`;
    }
    if (importee.startsWith(`svelte/`)) {
      const sub_path = importee.slice(7);
      const basePath = `${svelteURL}/src/${sub_path}`;
      return await resolveSvelteImport(basePath);
    }

    // Handle Svelte internal package imports (e.g., #client/constants)
    if (importee.startsWith("#client/")) {
      const sub_path = importee.slice(8); // Remove '#client/'
      const basePath = `${svelteURL}/src/internal/client/${sub_path}`;
      return await resolveSvelteImport(basePath);
    }

    // importing from a URL
    if (/^https?:/.test(importee)) return importee;

    // Relative imports
    if (importee.startsWith(".")) {
      if (importer && importer.startsWith(svelteURL)) {
        const resolved = new URL(importee, importer).href;
        const url = new URL(importee, importer).href;
        if (debug) {
          console.log(
            "[transformSvelte] resolveId() " + resolved,
          );
        }
        return resolved;
      }
    }
  },

  transform: async (
    code: string,
    id: ResolvedVizFileId,
  ) => {
    const { fileName } = parseId(id);

    const isSvelte = fileName.endsWith(".svelte");

    if (isSvelte) {
      if (!compile) {
        if (!getSvelteCompiler) {
          throw new Error("Svelte compiler not available");
        }
        compile = await getSvelteCompiler();
      }

      const compiled = compile(code, {
        filename: fileName,
        generate: "client", // Svelte 5 uses 'client' instead of 'dom'
        css: "external", // Extract CSS instead of auto-injecting
        dev: false, // Production mode
      });

      // In Svelte 5, CSS is extracted separately if css: 'external' is used
      let result = compiled.js.code;

      // If there's CSS, inject it into the component
      if (compiled.css && compiled.css.code) {
        // Prepend CSS injection code to the component
        const cssCode = JSON.stringify(compiled.css.code);
        const cssInjection = `
// Auto-inject CSS for Svelte component
(function() {
  if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = ${cssCode};
    document.head.appendChild(style);
  }
})();
`;
        result = cssInjection + result;
      }

      return result;
    }
    return undefined;
  },
});
