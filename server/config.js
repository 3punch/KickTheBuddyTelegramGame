import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");

/** Load .env (tiny, dependency-free parser). */
function loadDotEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv();

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  root: ROOT,
  webRoot: path.join(ROOT, "web"),
  publicUrl: (process.env.PUBLIC_URL || "").replace(/\/+$/, ""),
  port: num(process.env.PORT, 8080),
  host: process.env.HOST || "0.0.0.0",
  botToken: (process.env.BOT_TOKEN || "").trim(),
  webhookSecret: (process.env.WEBHOOK_SECRET || "change-me-please").trim(),
  dbPath: path.resolve(ROOT, process.env.DB_PATH || "./data/game.db"),
  adminIds: (process.env.ADMIN_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
  usePolling: process.env.USE_POLLING === "1",
  startCoins: num(process.env.START_COINS, 250),
  isProduction: process.env.NODE_ENV === "production",
};

export const botEnabled = () => Boolean(config.botToken);
