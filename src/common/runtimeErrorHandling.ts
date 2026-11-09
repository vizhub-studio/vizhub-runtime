import {
  toRuntimeDiagnostic,
  type RuntimeDiagnosticKind,
} from "./runtimeDiagnostic";

/** Legacy human-readable rendering; new consumers should use runtimeDiagnostic. */
export const formatRuntimeError = (
  error: Error | ErrorEvent | PromiseRejectionEvent,
): string => {
  const kind: RuntimeDiagnosticKind =
    error && typeof error === "object" && "reason" in error
      ? "unhandled_rejection"
      : "runtime";
  const diagnostic = toRuntimeDiagnostic(error, kind);
  const location = diagnostic.filename && diagnostic.line
    ? " at " + diagnostic.filename + ":" + diagnostic.line +
      (diagnostic.column ? ":" + diagnostic.column : "")
    : "";
  if (diagnostic.kind === "unhandled_rejection") {
    return diagnostic.name
      ? "Unhandled Promise Rejection - " + diagnostic.name + ": " +
          diagnostic.message + (diagnostic.stack ? "\n" + diagnostic.stack : "")
      : "Unhandled Promise Rejection: " + diagnostic.message;
  }
  if (diagnostic.kind === "resource" || diagnostic.kind === "security_policy") {
    return diagnostic.message;
  }
  if (diagnostic.name) {
    return diagnostic.name + ": " + diagnostic.message + location +
      (diagnostic.stack ? "\n" + diagnostic.stack : "");
  }
  if (diagnostic.message !== "[object Object]" &&
      diagnostic.message !== "[object ErrorEvent]") {
    return "Error: " + diagnostic.message + location;
  }
  return "Unknown runtime error: " + String(error);
};

/**
 * Install before visualization code; the formatter is self-contained.
 * Keep legacy runtimeError postMessage during the consumer migration.
 */
export const getRuntimeErrorHandlerScript = (): string =>
  "(() => {" +
  "const toRuntimeDiagnostic = " + toRuntimeDiagnostic.toString() + ";" +
  "const formatRuntimeError = " + formatRuntimeError.toString() + ";" +
  "const emit = (event, kind) => {" +
  "try {" +
  "parent.postMessage({type:'runtimeDiagnostic',diagnostic:toRuntimeDiagnostic(event,kind)},'*');" +
  "parent.postMessage({type:'runtimeError',formattedErrorMessage:formatRuntimeError(event)},'*');" +
  "} catch (_) { /* diagnostics must not break the visualization */ }" +
  "};" +
  "window.__vizhubReportCaughtError = (error) => emit(error, 'runtime');" +
  "window.addEventListener('error',(event) => emit(event,'runtime'),true);" +
  "window.addEventListener('unhandledrejection',(event) => emit(event,'unhandled_rejection'));" +
  "window.addEventListener('securitypolicyviolation',(event) => emit(event,'security_policy'));" +
  "})();";
