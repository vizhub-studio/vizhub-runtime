# Structured runtime diagnostics

Visualization iframes emit a versioned runtimeDiagnostic postMessage containing
diagnostic: { version: 1, kind, message, name?, stack?, filename?, line?, column?, redacted? }.
They also emit the legacy runtimeError formattedErrorMessage for older clients.
Supported kinds: runtime, unhandled_rejection, resource, security_policy.

Handlers capture non-bubbling resource failures, promise rejections and CSP violations.
Caught V3/V4 rendering exceptions also use the same diagnostic bridge.
Stack and message lengths are bounded. Consumers must render diagnostics as text.

Cross-origin classic-script exceptions may be redacted by the browser. These
are marked redacted=true; a stack cannot be recovered without correct CORS.
V2 dependency scripts from jsDelivr and unpkg request anonymous CORS.
Arbitrary author scripts are unchanged because forcing CORS without server
support can prevent them from executing. Source maps cannot bypass redaction.

Security: only accept postMessage from the currently registered iframe
(event.source === iframe.contentWindow). The parent owns viz/revision identity.
Consumers must filter stale/replaced frames. The createRuntime
handleRuntimeDiagnostic callback is optional and backward-compatible.

Validation: run unit and all-runtime-version tests, then manually reproduce
a same-origin throw and a cross-origin redacted error in a browser.
