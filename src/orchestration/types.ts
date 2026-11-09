import type { RuntimeDiagnostic } from "../common/runtimeDiagnostic";
// type FileCollection = Record<string, string>;
import { FileCollection, VizId } from "@vizhub/viz-types";
import { BuildResult } from "../build/types";

export type VizHubRuntime = {
  // Resets the iframe srcdoc when code changes.
  run: (options: {
    // The fresh files to be built.
    files: FileCollection;

    // Toggle for hot reloading,
    // only respected for v3 runtime.
    enableHotReloading?: boolean;

    // Toggle for sourcemaps.
    enableSourcemap?: boolean;

    // The ID of the viz.
    // Only strictly required for v3 runtime.
    vizId?: VizId;

    // Toggle for clearing console before each run.
    // Defaults to true for backward compatibility.
    clearConsole?: boolean;
  }) => void;

  // Cleans up the event listeners from the Worker and the iframe.
  cleanup: () => void;

  // Called when viz ids change, to invalidate the viz cache.
  // This happens when imported vizzes change, and trigger
  // hot reloading across vizzes.
  invalidateVizCache: (
    changedVizIds: Array<string>,
  ) => Promise<void>;
};

// The message types for the worker.
export type BuildWorkerMessage =
  // `buildRequest`
  //  * Sent from the main thread to the worker.
  //  * When the main thread wants to build the HTML for the iframe.
  | {
      type: "buildRequest";
      files: FileCollection;
      enableSourcemap: boolean;
      requestId: string;
      vizId?: VizId;
    }

  // `buildResponse`
  //  * Sent from the worker to the main thread.
  //  * When the worker responds to a `buildRequest` message.
  //  * Provides:
  //  * EITHER a fresh `buildResult`
  //  * OR an `error` if the build failed.
  | {
      type: "buildResponse";
      requestId: string;
      buildResult?: BuildResult;
      error?: string;
    }

  // `contentRequest`
  //  * Sent from the worker to the main thread.
  //  * When the worker requests the content of an imported viz.
  | {
      type: "contentRequest";
      vizId: string;
      requestId: string;
    }

  // `contentResponse`
  //  * Sent from the main thread to the worker.
  //  * When the main thread responds to a contentRequest.
  | {
      type: "contentResponse";
      vizId: string;
      content: any;
      requestId: string;
    }

  // `resolveSlugRequest`
  //  * Sent from the worker to the main thread.
  //  * When the worker requests to resolve a slug to a viz ID.
  | {
      type: "resolveSlugRequest";
      slugKey: string;
      requestId: string;
    }

  // `resolveSlugResponse`
  //  * Sent from the main thread to the worker.
  //  * When the main thread responds with the resolved viz ID.
  //  * This is used to resolve the viz ID for the slug key.
  //  * If the slug key is not found, vizId will be null.
  | {
      type: "resolveSlugResponse";
      vizId: VizId | null;
      requestId: string;
    }

  // `invalidateVizCacheRequest`
  //  * Sent from the main thread to the worker.
  //  * When viz content has changed and cache needs invalidation.
  | {
      type: "invalidateVizCacheRequest";
      changedVizIds: Array<string>;
      requestId: string;
    }

  // `invalidateVizCacheResponse`
  //  * Sent from the worker to the main thread.
  //  * Confirms cache invalidation.
  | {
      type: "invalidateVizCacheResponse";
      requestId: string;
    };

// The message types for the iframe.
export type WindowMessage =
  // `runJS` (request to iframe)
  //  * Sent from the main thread to the IFrame.
  //  * Triggers hot reloading within the V3 runtime.
  | {
      type: "runJS";
      js: string;
    }

  // `runCSS` (request to iframe)
  //  * Sent from the main thread to the IFrame.
  //  * Triggers hot reloading of CSS within the V3 runtime.
  | {
      type: "runCSS";
      css: string;
    }

  // `runDone` (response to "runJS" from iframe)
  //  * Sent from the iframe to the main thread.
  //  * Indicates successful code execution.
  | {
      type: "runDone";
      requestId: string;
    }

  // `runError` (response to "runJS" from iframe)
  //  * Sent from the iframe to the main thread.
  //  * Indicates an error during code execution.
  | {
      type: "runError";
      error: Error;
      requestId: string;
    }

  // Structured, backward-compatible diagnostics (versioned, bounded).
  | {
      type: "runtimeDiagnostic";
      diagnostic: RuntimeDiagnostic;
    }

  // `runtimeError` (spontaneous error from iframe)
  //  * Sent from the iframe to the main thread.
  //  * Indicates a runtime error that occurred in user code.
  | {
      type: "runtimeError";
      formattedErrorMessage: string;
    }

  // `writeFile` (request from user generated code running inside iframe)
  //  * Sent from the iframe to the main thread.
  //  * Request to write file content.
  | {
      type: "writeFile";
      fileName: string;
      content: string;
    };
