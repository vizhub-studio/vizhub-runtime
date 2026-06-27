import {
  FileCollection,
  VizContent,
  VizId,
} from "@vizhub/viz-types";

import { setupInvalidateVizCache } from "./setupInvalidateVizCache";
import { setupBuild } from "./setupBuild";
import {
  BuildWorkerMessage,
  VizHubRuntime,
  WindowMessage,
} from "./types";

// Flag for debugging.
const DEBUG = false;

// State constants:

// Nothing happening.
const IDLE = "IDLE";

// An update has been enqueued
// via requestAnimationFrame.
const ENQUEUED = "ENQUEUED";

// An update (build and run) is pending,
// and the files have not changed.
const PENDING_CLEAN = "PENDING_CLEAN";

// An update (build and run) is pending,
// and the files have changed
// while this run is taking place.
const PENDING_DIRTY = "PENDING_DIRTY";

// Valid State Transitions:
//
//  * IDLE --> ENQUEUED
//    When the system is idle and files are changed.
//
//  * ENQUEUED --> PENDING_CLEAN
//    When the pending changes run.
//
//  * PENDING_CLEAN --> IDLE
//    When the pending update finishes running
//    and files were not changed in the mean time.
//
//  * PENDING_CLEAN --> PENDING_DIRTY
//    When files are changed while an update is pending.
//
//  * PENDING_DIRTY --> ENQUEUED
//    When the pending update finishes running
//    and files were changed in the mean time.
//
// When a build error happens, the state is set to IDLE.
// This is to prevent a build error from causing
// the whole system to stop working.

// Creates an instance of the VizHub Runtime Environment.
// This is the main entry point for the runtime, for use
// by front end applications.
// It sets up the iframe and worker, and handles messages
// between them.
// For server-side rendering where only a build is required,
// just use the build function directly.
export const createRuntime = ({
  iframe,
  worker,
  setBuildErrorMessage,
  getLatestContent,
  resolveSlugKey,
  writeFile,
  handleRuntimeError,
}: {
  iframe: HTMLIFrameElement;
  worker: Worker;
  setBuildErrorMessage?: (error: string | null) => void;
  getLatestContent?: (
    vizId: VizId,
  ) => Promise<VizContent | null>;
  resolveSlugKey?: (
    slugKey: string,
  ) => Promise<VizId | null>;
  writeFile?: (fileName: string, content: string) => void;
  handleRuntimeError?: (
    formattedErrorMessage: string,
  ) => void;
}): VizHubRuntime => {
  // Track the current state of the runtime
  let state:
    | typeof IDLE
    | typeof ENQUEUED
    | typeof PENDING_CLEAN
    | typeof PENDING_DIRTY = IDLE;

  // When a run is requested while the state is PENDING_CLEAN
  // or PENDING_DIRTY, we need to wait for the pending build to finish,
  // so until the build finishes, we use `latestFiles` to stash the latest files.
  let latestFiles: FileCollection | null = null;

  const build = setupBuild({
    worker,
    setBuildErrorMessage,
  });

  // Pending promise resolvers
  let pendingRunPromise: (() => void) | null = null;

  // This runs when the build worker sends a message.
  const workerListener: (e: MessageEvent) => void = ({
    data,
  }: {
    data: BuildWorkerMessage;
  }) => {
    if (
      data.type === "contentRequest" &&
      getLatestContent
    ) {
      DEBUG &&
        console.log(
          "[worker] contentRequest",
          JSON.stringify(data, null, 2),
        );
      const { vizId } = data;

      getLatestContent(vizId).then((content) => {
        worker.postMessage({
          type: "contentResponse",
          vizId,
          content,
        });
      });
    } else if (data.type === "resolveSlugRequest") {
      DEBUG &&
        console.log(
          "[worker] resolveSlugRequest",
          JSON.stringify(data, null, 2),
        );
      const { slugKey, requestId } = data;

      if (resolveSlugKey) {
        DEBUG &&
          console.log(
            "[worker] resolveSlugRequest: resolving slug key",
            slugKey,
          );
        resolveSlugKey(slugKey).then(
          (vizId: VizId | null) => {
            DEBUG &&
              console.log(
                "[worker] resolveSlugRequest: resolved slug key",
                slugKey,
                "to vizId",
                vizId,
              );
            const message: BuildWorkerMessage = {
              type: "resolveSlugResponse",
              vizId,
              requestId,
            };
            worker.postMessage(message);
          },
        );
      } else {
        DEBUG &&
          console.log(
            "[worker] resolveSlugRequest: no slug resolver, returning null",
            JSON.stringify(data, null, 2),
          );
        // If we don't have a slug resolver, we just
        // send back the slug key as the vizId.
        const message: BuildWorkerMessage = {
          type: "resolveSlugResponse",
          vizId: null,
          requestId,
        };
        worker.postMessage(message);
      }
    }
  };

  worker.addEventListener("message", workerListener);

  // Handle messages from the iframe
  // IMPORTANT: check event.source to only process messages from our own iframe.
  const windowListener = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow) return;
    const data = event.data;

    if (
      data.type === "runDone" ||
      data.type === "runError"
    ) {
      if (pendingRunPromise) {
        pendingRunPromise();
        pendingRunPromise = null;
      }

      if (data.type === "runError") {
        setBuildErrorMessage &&
          setBuildErrorMessage(data.error.message);
      }
    }

    if (
      data.type === "runtimeError" &&
      handleRuntimeError
    ) {
      handleRuntimeError(data.formattedErrorMessage);
    }

    if (data.type === "writeFile" && writeFile) {
      if (data.fileName && data.content) {
        writeFile(data.fileName, data.content);
      }
    }
  };

  // This runs when the IFrame sends a message.
  window.addEventListener("message", windowListener);

  const cleanup = () => {
    worker.removeEventListener("message", workerListener);
    window.removeEventListener("message", windowListener);
  };

  const update = async ({
    files,
    enableHotReloading = false,
    enableSourcemap = false,
    vizId,
    clearConsole = true,
  }: {
    files: FileCollection;
    enableHotReloading?: boolean;
    enableSourcemap?: boolean;
    vizId?: VizId;
    clearConsole?: boolean;
  }) => {
    state = PENDING_CLEAN;

    DEBUG && console.log("[runtime] update: before build");

    // Build the code
    const buildResult = await build({
      files,
      enableSourcemap,
      vizId,
    });

    // In this case, the build failed
    // and in the meantime the callback `setBuildErrorMessage`
    // was called.
    if (!buildResult) {
      DEBUG &&
        console.log("[runtime] update: build failed");
    }

    DEBUG && console.log("[runtime] update: after build");

    if (buildResult) {
      const { html, runtimeVersion, js, css } = buildResult;

      DEBUG &&
        console.log(
          "[runtime] enableHotReloading",
          enableHotReloading,
        );

      DEBUG &&
        console.log(
          "[runtime] html: ",
          html?.substring(0, 200),
        );

      DEBUG &&
        console.log(
          "[runtime] js: ",
          js?.substring(0, 200),
        );

      DEBUG &&
        console.log(
          "[runtime] css: ",
          css?.substring(0, 200),
        );

      // Clear the console before each run.
      !DEBUG && clearConsole && console.clear();

      // The `enableHotReloading` only works for v3 and v4.
      if (
        enableHotReloading &&
        (runtimeVersion === "v3" || runtimeVersion === "v4")
      ) {
        if (css) {
          const runCSSMessage: WindowMessage = {
            type: "runCSS",
            css,
          };
          if (!iframe.contentWindow) {
            throw new Error(
              "iframe.contentWindow is null - this should never happen",
            );
          }
          iframe.contentWindow.postMessage(
            runCSSMessage,
            window.location.origin,
          );
        }
        if (js) {
          const runJSMessage: WindowMessage = {
            type: "runJS",
            js,
          };
          if (!iframe.contentWindow) {
            throw new Error(
              "iframe.contentWindow is null - this should never happen",
            );
          }
          iframe.contentWindow.postMessage(
            runJSMessage,
            window.location.origin,
          );
        }
      } else {
        iframe.srcdoc = html || "";
      }
    }

    // TypeScript can't comprehend that `state`
    // may change during the await calls above.
    // @ts-ignore
    if (state === PENDING_DIRTY) {
      requestAnimationFrame(() => {
        if (!latestFiles) {
          throw new Error(
            "latestFiles is not defined and state is PENDING_DIRTY - this should never happen",
          );
        }
        update({
          files: latestFiles,
          enableHotReloading,
          enableSourcemap,
          vizId,
          clearConsole,
        });
      });
      state = ENQUEUED;
    } else {
      state = IDLE;
    }
  };

  // Handle code changes

  const run = ({
    files,
    enableHotReloading = false,
    enableSourcemap = false,
    vizId = undefined,
    clearConsole = true,
  }: {
    files: FileCollection;
    enableHotReloading?: boolean;
    enableSourcemap?: boolean;
    vizId?: VizId;
    clearConsole?: boolean;
  }) => {
    DEBUG && console.log("[runtime] run");
    latestFiles = null;
    if (state === IDLE) {
      DEBUG && console.log("[runtime] run: IDLE");
      state = ENQUEUED;
      update({
        files,
        enableHotReloading,
        enableSourcemap,
        vizId,
        clearConsole,
      });
    } else if (state === PENDING_CLEAN) {
      DEBUG && console.log("[runtime] run: PENDING_CLEAN");
      latestFiles = files;
      state = PENDING_DIRTY;
    } else if (state === PENDING_DIRTY) {
      DEBUG && console.log("[runtime] run: PENDING_DIRTY");
      latestFiles = files;
    } else if (state === ENQUEUED) {
      DEBUG && console.log("[runtime] run: ENQUEUED");
      latestFiles = files;
    } else {
      throw new Error(`Unexpected state: ${state}`);
    }
  };

  return {
    invalidateVizCache: setupInvalidateVizCache(worker),
    run,
    cleanup,
  };
};
