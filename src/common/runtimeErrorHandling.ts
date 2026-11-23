import {
  toRuntimeDiagnostic,
  type RuntimeDiagnostic,
  type RuntimeDiagnosticKind,
} from "./runtimeDiagnostic";

/** Converts a normalized diagnostic into the legacy string-only contract. */
export const formatRuntimeDiagnostic = (
  diagnostic: RuntimeDiagnostic,
): string => {
  // This formatter is also stringified into the sandboxed iframe.
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
  if (diagnostic.message === "[object Object]" ||
      diagnostic.message === "[object ErrorEvent]") {
    return "Unknown runtime error: " + diagnostic.message;
  }
  return "Error: " + diagnostic.message + location;
};

/** Public legacy formatter retained for callers expecting a string. */
export const formatRuntimeError = (
  error: Error | ErrorEvent | PromiseRejectionEvent,
  kindOverride?: RuntimeDiagnosticKind,
): string => {
  const kind: RuntimeDiagnosticKind = kindOverride ?? (
    error && typeof error === "object" && "reason" in error
      ? "unhandled_rejection"
      : "runtime");
  return formatRuntimeDiagnostic(toRuntimeDiagnostic(error, kind));
};

/**
 * Self-contained functions are stringified into srcdoc, not imported into it.
 * Preserve runtimeError while consumers migrate to runtimeDiagnostic.
 */
export const getRuntimeErrorHandlerScript = (): string =>
  "(() => {" +
  "const toRuntimeDiagnostic = " + toRuntimeDiagnostic.toString() + ";" +
  "const formatRuntimeDiagnostic = " + formatRuntimeDiagnostic.toString() + ";" +
  "const emit = (event, kind) => {" +
  "try {" +
  "const diagnostic = toRuntimeDiagnostic(event,kind);" +
  "parent.postMessage({ type: 'runtimeDiagnostic', diagnostic },'*');" +
  "parent.postMessage({ type: 'runtimeError', formattedErrorMessage: formatRuntimeDiagnostic(diagnostic) },'*');" +
  "} catch (_) { /* diagnostics must not break the visualization */ }" +
  "};" +
  "window.__vizhubReportCaughtError = (error) => emit(error, 'runtime');" +
  "window.addEventListener('error',(event) => emit(event,'runtime'),true);" +
  "window.addEventListener('unhandledrejection',(event) => emit(event,'unhandled_rejection'));" +
  "window.addEventListener('securitypolicyviolation',(event) => emit(event,'security_policy'));" +
  "})();";
