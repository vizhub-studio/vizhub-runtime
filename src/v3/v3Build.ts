import { RollupBuild, RollupOptions } from "rollup";
import { getFileText } from "@vizhub/viz-utils";
import { computeBundleJSV3 } from "./computeBundleJSV3";
import { htmlTemplate } from "./htmlTemplate";
import { VizCache } from "./vizCache.js";
import {
  FileCollection,
  VizContent,
  VizId,
} from "@vizhub/viz-types";
import { parseId } from "./parseId.js";
import { ResolvedVizFileId } from "./types.js";
import { SlugCache } from "./slugCache.js";
import { SvelteCompiler } from "./transformSvelte.js";
import {
  dependencies,
  getConfiguredLibraries,
  dependencySource,
} from "../common/packageJson";
import { BuildResult } from "../build/types";

export const v3Build = async ({
  files,
  rollup,
  enableSourcemap = true,
  vizCache,
  vizId,
  slugCache,
  getSvelteCompiler,
}: {
  files: FileCollection;
  rollup: (options: RollupOptions) => Promise<RollupBuild>;
  enableSourcemap?: boolean;
  vizCache: VizCache;
  vizId: VizId;
  slugCache?: SlugCache;
  getSvelteCompiler?: () => Promise<SvelteCompiler>;
}): Promise<BuildResult> => {
  const { src, cssFiles } = await computeBundleJSV3({
    files,
    rollup,
    enableSourcemap,
    vizCache,
    vizId,
    slugCache,
    getSvelteCompiler,
  });

  // Generate CSS styles from imported CSS files
  let cssFileTextArray: string[] = [];

  // Inject CSS files.
  if (cssFiles.length > 0) {
    for (let i = 0; i < cssFiles.length; i++) {
      const id: ResolvedVizFileId = cssFiles[i];

      const parsedId = parseId(id);
      const parsedVizId = parsedId.vizId;
      const parsedFileName = parsedId.fileName;

      // If we are resolving to the root vizId, we can
      // use the files object directly.
      // Otherwise, we need to get the content from the vizCache.
      // This makes it so the vizCache is _only_ used for
      // resolving cross-viz imports.
      let fileText: string | null = null;
      if (parsedVizId === vizId && files) {
        fileText = files[parsedFileName] || null;
      } else {
        const content = await vizCache.get(parsedVizId);
        fileText = getFileText(content, parsedFileName);
      }
      if (fileText) {
        cssFileTextArray.push(fileText);
      }
    }
  }

  // The concatenated CSS text.
  const css = cssFileTextArray.join("\n");

  const styles = `\n    <style id="injected-style">${css}</style>`;
  // Generate CDN script tags for dependencies
  let cdn = "";
  const deps: [string, string][] = Object.entries(
    dependencies(files),
  );
  if (deps.length > 0) {
    const libraries = getConfiguredLibraries(files);
    cdn = deps
      .map(([name, version], i) => {
        const dependencySrc = dependencySource(
          { name, version },
          libraries,
        );
        const indent = i > 0 ? "    " : "\n    ";
        const cors = /^https:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com)\//.test(dependencySrc)
          ? ' crossorigin="anonymous"'
          : "";
        return `${indent}<script src="${dependencySrc}"${cors}></script>`;
      })
      .join("");
  }

  return {
    html: htmlTemplate({ cdn, src, styles }),
    css,
    js: src,
    runtimeVersion: "v3",
  };
};
