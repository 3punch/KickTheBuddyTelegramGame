import crypto from "node:crypto";
import { config } from "./config.js";

/**
 * Verify Telegram WebApp initData.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Returns { ok, user, authDate, reason }. When no BOT_TOKEN is configured the
 * server runs in preview mode and accepts anonymous demo sessions.
 */
export function verifyInitData(initData, { maxAgeSeconds = 60 * 60 * 24 } = {}) {
  if (!config.botToken) {
    return { ok: true, demo: true, user: null, authDate: null };
  }
  if (!initData || typeof initData !== "string") {
    return { ok: false, reason: "missing_init_data" };
  }

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "malformed_init_data" };
  }

  const hash = params.get("hash") || "";
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    return { ok: false, reason: "missing_hash" };
  }
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(config.botToken)
    .digest();
  const computed = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate) return { ok: false, reason: "missing_auth_date" };
  if (maxAgeSeconds > 0 && Date.now() / 1000 - authDate > maxAgeSeconds) {
    return { ok: false, reason: "expired" };
  }

  let user = null;
  try {
    user = JSON.parse(params.get("user") || "null");
  } catch {
    user = null;
  }

  return { ok: true, user, authDate, startParam: params.get("start_param") || null };
}

/** Stable, non-reversible key for a Telegram user id. */
export function sessionKeyFor(user) {
  if (!user?.id) return null;
  return crypto
    .createHash("sha256")
    .update(`${user.id}:${config.botToken ? config.webhookSecret : "demo"}`)
    .digest("hex")
    .slice(0, 32);
}
