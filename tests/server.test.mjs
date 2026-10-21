/**
 * Server unit tests: initData HMAC verification, asset manifest scanning,
 * the SQLite leaderboard and the score guard rails.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ktp-test-"));
process.env.BOT_TOKEN = "123456:TEST-TOKEN";
process.env.WEBHOOK_SECRET = "s3cret";
process.env.DB_PATH = path.join(tmpDir, "test.db");
process.env.START_COINS = "300";

const { verifyInitData, sessionKeyFor } = await import("../server/validation.js");
const { getManifest } = await import("../server/assets.js");
const { upsertPlayer, recordRound, leaderboard, rankOf, globalStats } = await import("../server/db.js");

function sign(params, token = process.env.BOT_TOKEN) {
  const dataCheckString = Object.entries(params)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...params, hash }).toString();
}

const user = { id: 4242, first_name: "Test", username: "tester", language_code: "ar" };
const baseParams = {
  auth_date: String(Math.floor(Date.now() / 1000)),
  query_id: "AAF",
  user: JSON.stringify(user),
};

before(() => {
  fs.mkdirSync(path.join(tmpDir, "assets", "backgrounds"), { recursive: true });
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

test("accepts a correctly signed initData payload", () => {
  const initData = sign(baseParams);
  const result = verifyInitData(initData);
  assert.equal(result.ok, true);
  assert.equal(result.user.id, 4242);
});

test("rejects tampered payloads, bad hashes and stale auth_date", () => {
  const initData = sign(baseParams);
  const tampered = initData.replace("tester", "hacker");
  assert.equal(verifyInitData(tampered).ok, false);

  assert.equal(verifyInitData("user=%7B%7D&hash=deadbeef").ok, false);
  assert.equal(verifyInitData("").reason, "missing_init_data");

  const stale = sign({ ...baseParams, auth_date: "1" });
  assert.equal(verifyInitData(stale).reason, "expired");

  const wrongToken = sign(baseParams, "999:OTHER");
  assert.equal(verifyInitData(wrongToken).ok, false);
});

test("session keys are stable and opaque", () => {
  const a = sessionKeyFor(user);
  const b = sessionKeyFor(user);
  assert.equal(a, b);
  assert.equal(a.length, 32);
  assert.ok(!a.includes("4242"));
  assert.equal(sessionKeyFor(null), null);
});

test("asset manifest lists the bundled sample face", () => {
  const manifest = getManifest({ force: true });
  assert.ok(Array.isArray(manifest.faces));
  assert.ok(manifest.faces.some((face) => face.id === "dean"));
  for (const slot of ["backgrounds", "dolls", "voicePacks"]) {
    assert.ok(Array.isArray(manifest[slot]), `${slot} is a list`);
  }
});

test("leaderboard ranks players by total damage", () => {
  const first = upsertPlayer({ id: 1, first_name: "Ada", language_code: "en" });
  assert.equal(first.first_name, "Ada");
  upsertPlayer({ id: 2, first_name: "Bo", language_code: "en" });

  recordRound(1, { damage: 900, combo: 12, kos: 1 });
  recordRound(1, { damage: 1100, combo: 20, kos: 1 });
  recordRound(2, { damage: 500, combo: 4, kos: 0 });

  const rows = leaderboard({ limit: 10 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 1);
  assert.equal(rows[0].total_damage, 2000);
  assert.equal(rows[0].best_round, 1100);
  assert.equal(rows[0].best_combo, 20);
  assert.equal(rankOf(1), 1);
  assert.equal(rankOf(2), 2);

  const week = leaderboard({ limit: 10, period: "week" });
  assert.equal(week[0].total_damage, 2000);

  const stats = globalStats();
  assert.equal(stats.players, 2);
  assert.equal(stats.rounds, 3);
  assert.equal(stats.damage, 2500);
});

test("score values are clamped to sane ranges", () => {
  upsertPlayer({ id: 3, first_name: "Cy", language_code: "en" });
  recordRound(3, { damage: Number.MAX_SAFE_INTEGER, combo: -5, kos: 99 });
  const row = leaderboard({ limit: 10 }).find((entry) => entry.id === 3);
  assert.equal(row.total_damage, 5_000_000);
  assert.equal(row.best_combo, 0);
});

test("unknown players do not create rows", () => {
  assert.equal(recordRound(999, { damage: 10 }), null);
});
