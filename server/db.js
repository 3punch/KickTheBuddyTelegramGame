import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

let db = null;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new DatabaseSync(config.dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS players (
      id            INTEGER PRIMARY KEY,
      username      TEXT,
      first_name    TEXT,
      lang          TEXT DEFAULT 'en',
      total_damage  INTEGER NOT NULL DEFAULT 0,
      best_round    INTEGER NOT NULL DEFAULT 0,
      best_combo    INTEGER NOT NULL DEFAULT 0,
      kos           INTEGER NOT NULL DEFAULT 0,
      rounds        INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rounds (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      damage      INTEGER NOT NULL,
      combo       INTEGER NOT NULL DEFAULT 0,
      kos         INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rounds_player ON rounds(player_id);
    CREATE INDEX IF NOT EXISTS idx_rounds_created ON rounds(created_at);
    CREATE INDEX IF NOT EXISTS idx_players_damage ON players(total_damage DESC);
  `);
  return db;
}

const now = () => Date.now();

export function upsertPlayer(user, lang = "en") {
  if (!user?.id) return null;
  const db = getDb();
  const existing = db.prepare("SELECT * FROM players WHERE id = ?").get(user.id);
  const firstName = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Player";
  if (!existing) {
    db.prepare(
      `INSERT INTO players (id, username, first_name, lang, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(user.id, user.username || null, firstName, lang, now(), now());
  } else {
    db.prepare(
      `UPDATE players SET username = ?, first_name = ?, lang = ?, updated_at = ? WHERE id = ?`
    ).run(user.username || existing.username, firstName, lang, now(), user.id);
  }
  return getPlayer(user.id);
}

export function getPlayer(id) {
  return getDb().prepare("SELECT * FROM players WHERE id = ?").get(id) || null;
}

export function recordRound(id, { damage, combo = 0, kos = 0 }) {
  const db = getDb();
  const player = getPlayer(id);
  if (!player) return null;
  const damageSafe = Math.max(0, Math.min(5_000_000, Math.round(damage)));
  const comboSafe = Math.max(0, Math.min(10_000, Math.round(combo)));
  const kosSafe = Math.max(0, Math.min(1_000, Math.round(kos)));
  const ts = now();

  db.prepare(
    `INSERT INTO rounds (player_id, damage, combo, kos, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, damageSafe, comboSafe, kosSafe, ts);

  db.prepare(
    `UPDATE players SET
       total_damage = total_damage + ?,
       best_round   = MAX(best_round, ?),
       best_combo   = MAX(best_combo, ?),
       kos          = kos + ?,
       rounds       = rounds + 1,
       updated_at   = ?
     WHERE id = ?`
  ).run(damageSafe, damageSafe, comboSafe, kosSafe, ts, id);

  return getPlayer(id);
}

export function rankOf(id, period = "all") {
  const db = getDb();
  if (period === "week") {
    const since = now() - 7 * 24 * 3600 * 1000;
    const row = db
      .prepare(
        `SELECT COUNT(*) + 1 AS rank FROM (
           SELECT player_id, SUM(damage) AS d FROM rounds
           WHERE created_at >= ? GROUP BY player_id
         ) WHERE d > COALESCE((SELECT SUM(damage) FROM rounds WHERE player_id = ? AND created_at >= ?), 0)`
      )
      .get(since, id, since);
    return row?.rank ?? null;
  }
  const row = db
    .prepare("SELECT COUNT(*) + 1 AS rank FROM players WHERE total_damage > ?")
    .get(getPlayer(id)?.total_damage ?? 0);
  return row?.rank ?? null;
}

export function leaderboard({ limit = 20, period = "all" } = {}) {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  if (period === "week") {
    const since = now() - 7 * 24 * 3600 * 1000;
    return db
      .prepare(
        `SELECT p.id, p.first_name, p.username,
                SUM(r.damage) AS total_damage, MAX(r.damage) AS best_round, MAX(r.combo) AS best_combo
         FROM rounds r JOIN players p ON p.id = r.player_id
         WHERE r.created_at >= ?
         GROUP BY r.player_id ORDER BY total_damage DESC LIMIT ?`
      )
      .all(since, safeLimit);
  }
  return db
    .prepare(
      `SELECT id, first_name, username, total_damage, best_round, best_combo
       FROM players WHERE total_damage > 0
       ORDER BY total_damage DESC LIMIT ?`
    )
    .all(safeLimit);
}

export function globalStats() {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS players, COALESCE(SUM(total_damage),0) AS damage,
                COALESCE(SUM(kos),0) AS kos, COALESCE(SUM(rounds),0) AS rounds FROM players`
      )
      .get() || { players: 0, damage: 0, kos: 0, rounds: 0 }
  );
}
