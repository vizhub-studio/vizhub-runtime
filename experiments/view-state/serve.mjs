// Zero-dependency fixture server. The sandboxed srcdoc module has origin
// "null", so the browser must be allowed to fetch its ES modules via CORS.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));
const prefix = "/experiments/view-state/";
const port = Number(process.env.PORT ?? 3002);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (!pathname.startsWith(prefix)) {
      response.writeHead(404).end();
      return;
    }

    const path = resolve(root, decodeURIComponent(pathname.slice(prefix.length)));
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) {
      response.writeHead(403).end();
      return;
    }

    const content = await readFile(path);
    response.writeHead(200, {
      "Content-Type": extname(path) === ".html"
        ? "text/html; charset=utf-8"
        : "text/javascript; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log("View-state fixtures: http://127.0.0.1:" + port + prefix + "fixtures/");
});
