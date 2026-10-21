import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { config } from "./config.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg; codecs=opus",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".webm": "audio/webm",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

const COMPRESSIBLE = /^(text\/|application\/(json|javascript|manifest)|image\/svg)/;

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

export function sendText(res, status, text, headers = {}) {
  const body = typeof text === "string" ? text : String(text);
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

/** Safe path resolution inside webRoot. */
function resolveStatic(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path
    .normalize(decoded)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const target = path.join(config.webRoot, normalized);
  if (!target.startsWith(config.webRoot)) return null;
  return target;
}

export function serveStatic(req, res, urlPath) {
  let filePath = resolveStatic(urlPath);
  if (!filePath) return sendText(res, 403, "Forbidden");

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }

  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;

  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { ETag: etag });
    res.end();
    return true;
  }

  const headers = {
    "Content-Type": type,
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    "Last-Modified": stat.mtime.toUTCString(),
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  };

  // Telegram WebView needs permissive framing for the Mini App.
  if (ext === ".html") {
    headers["Content-Security-Policy"] =
      "default-src 'self' https://telegram.org; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://telegram.org; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob:; " +
      "media-src 'self' data: blob: https:; " +
      "connect-src 'self' https:; " +
      "font-src 'self' data:; " +
      "frame-ancestors *;";
    headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
  }

  const acceptsGzip = /\bgzip\b/.test(req.headers["accept-encoding"] || "");
  if (acceptsGzip && COMPRESSIBLE.test(type) && stat.size > 1024) {
    const stream = fs.createReadStream(filePath);
    res.writeHead(200, { ...headers, "Content-Encoding": "gzip", Vary: "Accept-Encoding" });
    stream.pipe(zlib.createGzip({ level: 6 })).pipe(res);
    return true;
  }

  res.writeHead(200, { ...headers, "Content-Length": stat.size });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  fs.createReadStream(filePath).pipe(res);
  return true;
}
