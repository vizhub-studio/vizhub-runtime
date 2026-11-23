/**
 * Versioned diagnostics emitted by visualization iframes.
 *
 * This formatter must stay self-contained: its source is embedded in srcdoc.
 */
export type RuntimeDiagnosticKind =
  | "runtime"
  | "unhandled_rejection"
  | "resource"
  | "security_policy";

export type RuntimeDiagnostic = {
  version: 1;
  kind: RuntimeDiagnosticKind;
  message: string;
  name?: string;
  stack?: string;
  filename?: string;
  line?: number;
  column?: number;
  /** The browser withheld the underlying cross-origin exception. */
  redacted?: boolean;
};

export function toRuntimeDiagnostic(
  value: unknown,
  requestedKind: RuntimeDiagnosticKind = "runtime",
): RuntimeDiagnostic {
  // This function is stringified into a sandboxed iframe: no outside helpers.
  const limit = (input: unknown, length: number): string =>
    typeof input === "string" ? input.slice(0, length) : "";
  const obj =
    value !== null && typeof value === "object"
      ? (value as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const isError = (input: unknown): input is Error =>
    input instanceof Error ||
    (input !== null &&
      typeof input === "object" &&
      typeof (input as Error).message === "string" &&
      typeof (input as Error).name === "string");
  const location = (input: unknown): number | undefined =>
    typeof input === "number" && Number.isInteger(input) && input > 0
      ? input
      : undefined;

  let kind = requestedKind;
  const target =
    obj.target !== null && typeof obj.target === "object"
      ? (obj.target as Record<string, unknown>)
      : null;
  // Resource load errors do not bubble; they are captured at window in capture phase.
  if (
    kind === "runtime" &&
    target &&
    typeof target.tagName === "string" &&
    !obj.message
  ) {
    kind = "resource";
  }

  if (kind === "security_policy") {
    const directive = limit(obj.violatedDirective, 120) || "Content Security Policy";
    const uri = limit(obj.blockedURI, 800);
    return {
      version: 1,
      kind,
      message: uri ? directive + " blocked " + uri : directive + " blocked a resource",
      filename: limit(obj.sourceFile, 800) || undefined,
      line: location(obj.lineNumber),
      column: location(obj.columnNumber),
    };
  }

  if (kind === "resource") {
    const tag = limit(target?.tagName, 40).toLowerCase() || "resource";
    const url = limit(target?.src || target?.href, 800);
    return {
      version: 1,
      kind,
      message: url ? "Failed to load " + tag + ": " + url : "Failed to load " + tag,
      filename: url || undefined,
    };
  }

  const candidate =
    kind === "unhandled_rejection"
      ? obj.reason
      : isError(obj.error)
        ? obj.error
        : value;
  const error = isError(candidate) ? candidate : null;
  const candidateObject =
    candidate !== null && typeof candidate === "object"
      ? (candidate as Record<string, unknown>)
      : null;
  const rawMessage =
    (error && limit(error.message, 2000)) ||
    limit(obj.message, 2000) ||
    (typeof candidate === "string" ? limit(candidate, 2000) : "") ||
    (candidateObject && limit(candidateObject.message, 2000)) ||
    (candidate === undefined ? "Unknown error" : limit(String(candidate), 2000));
  const redacted =
    kind === "runtime" && !error && /^script error\.?$/i.test(rawMessage);
  const message = redacted
    ? "Script error. The browser hid the exception details for a cross-origin script."
    : rawMessage;
  const name = error
    ? limit(error.name, 80) || "Error"
    : candidateObject
      ? limit(candidateObject.name, 80) || undefined
      : undefined;
  const stack = error
    ? limit(error.stack, 12000) || undefined
    : candidateObject
      ? limit(candidateObject.stack, 12000) || undefined
      : undefined;
  return {
    version: 1,
    kind,
    message,
    name,
    stack,
    filename: limit(obj.filename, 800) || undefined,
    line: location(obj.lineno),
    column: location(obj.colno),
    ...(redacted ? { redacted: true } : {}),
  };
}
