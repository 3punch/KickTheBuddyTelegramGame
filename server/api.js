import { config, botEnabled } from "./config.js";
import { verifyInitData } from "./validation.js";
import { getManifest } from "./assets.js";
import {
  upsertPlayer,
  getPlayer,
  recordRound,
  leaderboard,
  rankOf,
  globalStats,
} from "./db.js";
import { sendJson } from "./static.js";
import { handleUpdate } from "./telegram.js";

const MAX_BODY = 64 * 1024;
const MAX_ROUND_DAMAGE = 5_000_000;
const SCORE_COOLDOWN_MS = 2000;

const lastSubmit = new Map(); // playerId -> timestamp

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("payload_too_large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("invalid_json"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function initDataFrom(req, body) {
  return req.headers["x-telegram-init-data"] || body?.initData || "";
}

function publicPlayer(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.first_name,
    username: row.username,
    totalDamage: row.total_damage,
    bestRound: row.best_round,
    bestCombo: row.best_combo,
    kos: row.kos,
    rounds: row.rounds,
  };
}

export async function handleApi(req, res, url) {
  const path = url.pathname;

  if (path === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      uptime: Math.round(process.uptime()),
      bot: botEnabled(),
      version: process.env.npm_package_version || "1.0.0",
    });
    return true;
  }

  if (path === "/api/config" && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      demoMode: !botEnabled(),
      publicUrl: config.publicUrl || null,
      startCoins: config.startCoins,
      assets: getManifest(),
      serverTime: Date.now(),
    });
    return true;
  }

  if (path === "/api/stats" && req.method === "GET") {
    sendJson(res, 200, { ok: true, stats: globalStats() });
    return true;
  }

  if (path === "/api/session" && req.method === "POST") {
    const body = await readJson(req);
    const auth = verifyInitData(initDataFrom(req, body));
    if (!auth.ok) {
      sendJson(res, 401, { ok: false, error: auth.reason });
      return true;
    }
    if (!auth.user) {
      // Preview / local development: an ephemeral demo identity.
      sendJson(res, 200, {
        ok: true,
        demo: true,
        player: {
          id: 0,
          name: "Guest",
          totalDamage: 0,
          bestRound: 0,
          bestCombo: 0,
          kos: 0,
          rounds: 0,
        },
        rank: null,
      });
      return true;
    }
    const lang = (body.lang || auth.user.language_code || "en").slice(0, 2);
    const player = upsertPlayer(auth.user, lang);
    sendJson(res, 200, {
      ok: true,
      demo: false,
      player: publicPlayer(player),
      rank: rankOf(player.id, "all"),
    });
    return true;
  }

  if (path === "/api/score" && req.method === "POST") {
    const body = await readJson(req);
    const auth = verifyInitData(initDataFrom(req, body));
    if (!auth.ok) {
      sendJson(res, 401, { ok: false, error: auth.reason });
      return true;
    }
    if (!auth.user) {
      // Don't persist demo scores, but answer success so the client UX is identical.
      sendJson(res, 200, { ok: true, demo: true, accepted: false });
      return true;
    }
    const playerId = auth.user.id;
    const now = Date.now();
    if (now - (lastSubmit.get(playerId) || 0) < SCORE_COOLDOWN_MS) {
      sendJson(res, 429, { ok: false, error: "too_fast" });
      return true;
    }

    const damageRaw = Number(body.damage);
    if (!Number.isFinite(damageRaw) || damageRaw < 0) {
      sendJson(res, 400, { ok: false, error: "bad_damage" });
      return true;
    }
    const damage = Math.min(MAX_ROUND_DAMAGE, Math.round(damageRaw));
    lastSubmit.set(playerId, now);

    const player = recordRound(playerId, {
      damage,
      combo: Number(body.combo) || 0,
      kos: Number(body.kos) || 0,
    });
    sendJson(res, 200, {
      ok: true,
      accepted: true,
      player: publicPlayer(player),
      rank: rankOf(playerId, "all"),
    });
    return true;
  }

  if (path === "/api/leaderboard" && req.method === "GET") {
    const period = url.searchParams.get("period") === "week" ? "week" : "all";
    const limit = Math.min(50, Number(url.searchParams.get("limit")) || 20);
    sendJson(res, 200, {
      ok: true,
      period,
      rows: leaderboard({ limit, period }).map((row, index) => ({
        place: index + 1,
        id: row.id,
        name: row.first_name || row.username || "Player",
        totalDamage: row.total_damage,
        bestRound: row.best_round,
        bestCombo: row.best_combo,
      })),
    });
    return true;
  }

  if (path.startsWith("/telegram/webhook/") && req.method === "POST") {
    const secret = path.split("/").pop();
    const header = req.headers["x-telegram-bot-api-secret-token"];
    if (secret !== config.webhookSecret || (header && header !== config.webhookSecret)) {
      sendJson(res, 403, { ok: false });
      return true;
    }
    const update = await readJson(req);
    sendJson(res, 200, { ok: true });
    // Process asynchronously — Telegram only needs a fast 200.
    handleUpdate(update).catch((error) => console.error("[webhook]", error));
    return true;
  }

  return false;
}

export function apiNotFound(res) {
  sendJson(res, 404, { ok: false, error: "not_found" });
}

export { getPlayer };
