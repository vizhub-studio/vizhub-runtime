import { FileCollection } from "@vizhub/viz-types";
import {
  dependencies,
  getConfiguredLibraries,
  dependencySource,
} from "../common/packageJson";
import { getRuntimeErrorHandlerScript } from "../common/runtimeErrorHandling";

const DEBUG = false;

/* ------------------------------------------------------------------ */
/*  tiny helpers                                                      */
/* ------------------------------------------------------------------ */

const hasTagPair = (html: string, tag: string) =>
  new RegExp(`<${tag}\\b`, "i").test(html) &&
  new RegExp(`</${tag}>`, "i").test(html);

/**  Make sure we have a complete <html><head></head><body></body> skeleton.   */
const normaliseSkeleton = (raw: string): string => {
  const trimmed = raw.trim();

  // If it already contains a *complete* html‑head‑body trio we keep it.
  if (
    hasTagPair(trimmed, "html") &&
    hasTagPair(trimmed, "head") &&
    hasTagPair(trimmed, "body")
  )
    return trimmed;

  // Otherwise wrap whatever is there inside a fresh skeleton.
  return `<html><head></head><body>${trimmed}</body></html>`;
};

/** Remove every script whose src matches the supplied RegExp (global & i). */
const stripScripts = (
  html: string,
  srcPattern: RegExp,
): string =>
  html.replace(
    new RegExp(
      `<script[^>]*src=["'][^"']*${srcPattern.source}[^"']*["'][^>]*>\\s*</script>`,
      "gi",
    ),
    "",
  );

/** Inject markup just before a closing tag (</head> or </body>). */
const injectBeforeClose = (
  html: string,
  closing: "</head>" | "</body>",
  markup: string,
) =>
  html.replace(
    new RegExp(closing, "i"),
    `${markup}${closing}`,
  );

/* ------------------------------------------------------------------ */
/*  core logic                                                        */
/* ------------------------------------------------------------------ */

const injectScripts = (
  template: string,
  files: FileCollection,
): string => {
  let html = normaliseSkeleton(template);

  /* -------------------- dependencies from package.json ------------ */
  const deps = Object.entries(dependencies(files)) as [
    string,
    string,
  ][];

  if (deps.length) {
    const libraries = getConfiguredLibraries(files);

    // Remove any previous dependency scripts
    deps.forEach(([name]) => {
      html = stripScripts(html, new RegExp(`${name}@`));
    });

    // Build & inject new ones (order preserved)
    const depMarkup = deps
      .map(([name, version]) =>
        dependencySource({ name, version }, libraries),
      )
      .map((src) => {
        // Only enable CORS for CDNs known to return ACAO. Applying this
        // to arbitrary author scripts could break otherwise-working vizzes.
        const cors = /^https:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com)\//.test(src)
          ? ' crossorigin="anonymous"'
          : "";
        return `<script src="${src}"${cors}></script>`;
      })
      .join("\n");

    html = injectBeforeClose(
      html,
      "</head>",
      depMarkup + "\n",
    );
  }

  /* -------------------- ensure exactly ONE bundle.js -------------- */
  const needBundle =
    files["bundle.js"] !== undefined ||
    files["index.js"] !== undefined;

  if (needBundle) {
    const bundleTag = `<script src="bundle.js"></script>`; // **no newline – keeps test #3 exact**

    // How many bundle.js scripts are already there & where?
    const bundleRe =
      /<script\b[^>]*\bsrc=["']bundle\.js["'][^>]*>\s*<\/script>/gi;
    const matches = [...html.matchAll(bundleRe)];

    const oneInBody =
      matches.length === 1 &&
      (() => {
        const idx = matches[0].index ?? -1;
        if (idx === -1) return false;
        const bodyOpen = html.search(/<body\b[^>]*>/i);
        const bodyClose = html.search(/<\/body>/i);
        return (
          bodyOpen !== -1 &&
          bodyClose !== -1 &&
          idx > bodyOpen &&
          idx < bodyClose
        );
      })();

    if (!oneInBody) {
      // wipe them all, then inject a clean one at the end of <body>
      html = html.replace(bundleRe, "");
      html = injectBeforeClose(html, "</body>", bundleTag);
    }
  }

  /* -------------------- inject runtime error handler ------------- */
  const errorHandlerScript = `<script>${getRuntimeErrorHandlerScript()}</script>\n`;
  html = injectBeforeClose(
    html,
    "</head>",
    errorHandlerScript,
  );

  /* -------------------- make sure <!DOCTYPE html> ----------------- */
  return /^\s*<!DOCTYPE/i.test(html)
    ? html
    : `<!DOCTYPE html>${html}`;
};

/* ------------------------------------------------------------------ */
/*  public API                                                        */
/* ------------------------------------------------------------------ */

export const getComputedIndexHtml = (
  files: FileCollection,
): string => {
  const htmlTemplate = files["index.html"];

  // No html and no JS – nothing to do.
  if (
    !htmlTemplate &&
    !files["index.js"] &&
    !files["bundle.js"]
  ) {
    DEBUG &&
      console.log(
        "[getComputedIndexHtml] No index.html file found",
      );
    return "";
  }

  const template =
    htmlTemplate ||
    "<!DOCTYPE html><html><head></head><body></body></html>";

  const result = injectScripts(template, files);

  DEBUG &&
    console.log("[getComputedIndexHtml] indexHtml", result);

  return result;
};
