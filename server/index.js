import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { config, botEnabled } from "./config.js";
import { sendJson, sendText, serveStatic } from "./static.js";
import { handleApi, apiNotFound } from "./api.js";
import { getManifest, writeManifest, MANIFEST_PATH } from "./assets.js";
import { getDb, globalStats } from "./db.js";
import { syncWebhook, syncMenuButton, startPolling, getMe } from "./telegram.js";

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  // Permissive CORS for preview tooling (same-origin in production).
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-telegram-init-data");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/telegram/")) {
      const handled = await handleApi(req, res, url);
      if (!handled) apiNotFound(res);
      return;
    }

    if (url.pathname === "/robots.txt") {
      return sendText(res, 200, "User-agent: *\nDisallow:\n");
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      if (serveStatic(req, res, "/index.html")) return;
      return sendText(res, 500, "web/index.html is missing");
    }

    if (serveStatic(req, res, url.pathname)) return;

    // SPA-ish fallback so deep links inside the Mini App still boot the game.
    if (!path.extname(url.pathname) && serveStatic(req, res, "/index.html")) return;

    sendText(res, 404, "Not found");
  } catch (error) {
    const status = error.status || 500;
    console.error("[server]", error.message);
    if (!res.headersSent) sendJson(res, status, { ok: false, error: error.message });
    else res.end();
  }
});

function ensureAssets() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.log("[assets] manifest.json missing — scanning web/assets …");
    const manifest = writeManifest();
    console.log(
      `[assets] ${manifest.backgrounds.length} background(s), ${manifest.faces.length} face(s), ` +
        `${manifest.dolls.length} doll(s), ${manifest.voicePacks.length} voice pack(s)`
    );
  } else {
    const manifest = getManifest({ force: true });
    console.log(
      `[assets] loaded ${manifest.backgrounds.length} bg / ${manifest.faces.length} face / ` +
        `${manifest.dolls.length} doll / ${manifest.voicePacks.length} voice pack(s)`
    );
  }
}

async function boot() {
  ensureAssets();
  getDb();
  const stats = globalStats();
  console.log(
    `[db] ${config.dbPath} — ${stats.players} player(s), ${stats.rounds} round(s) recorded`
  );

  server.listen(config.port, config.host, () => {
    const base = config.publicUrl || `http://localhost:${config.port}`;
    console.log(`\n  🥊 Kick the Professor`);
    console.log(`  ────────────────────────────────────────────`);
    console.log(`  Local      : http://localhost:${config.port}`);
    console.log(`  Public URL : ${base}`);
    console.log(`  Bot        : ${botEnabled() ? "enabled" : "preview mode (no BOT_TOKEN)"}`);
    console.log(`  Leaderboard: SQLite (${path.basename(config.dbPath)})`);
    console.log(`  ────────────────────────────────────────────\n`);
  });

  if (botEnabled()) {
    try {
      const me = await getMe();
      console.log(`[telegram] connected as @${me.username}`);
      const webhook = await syncWebhook();
      console.log(`[telegram] webhook:`, webhook);
      const menu = await syncMenuButton();
      console.log(`[telegram] menu button:`, menu);
      if (config.usePolling) {
        const controller = new AbortController();
        process.on("SIGINT", () => controller.abort());
        process.on("SIGTERM", () => controller.abort());
        startPolling(controller.signal);
      }
    } catch (error) {
      console.error("[telegram] setup failed:", error.message);
    }
  } else {
    console.log(
      "[telegram] BOT_TOKEN not set — running in preview mode.\n" +
        "           Set BOT_TOKEN in .env to enable the bot + leaderboard identity."
    );
  }
}

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));

boot();
