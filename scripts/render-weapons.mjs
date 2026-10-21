/**
 * Dev-only: renders every weapon rig and a few mid-swing frames to PNG so the
 * art and the strike timing can be reviewed without a browser.
 *   node scripts/render-weapons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let createCanvas;
try {
  ({ createCanvas } = await import("@napi-rs/canvas"));
} catch {
  console.error("npm i -D @napi-rs/canvas");
  process.exit(1);
}

globalThis.document = { createElement: (tag) => (tag === "canvas" ? createCanvas(8, 8) : {}) };

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outDir = path.join(root, "tmp");
fs.mkdirSync(outDir, { recursive: true });

const { WEAPONS, WEAPON_BY_ID } = await import("../web/js/content.js");
const { drawRig } = await import("../web/js/weaponry.js");
const { Attacker } = await import("../web/js/attacker.js");
const { Doll } = await import("../web/js/doll.js");
const { Background } = await import("../web/js/background.js");

/* ── contact sheet of every rig ─────────────────────────────────────────── */
{
  const cols = 6;
  const cell = 190;
  const rows = Math.ceil(WEAPONS.length / cols);
  const canvas = createCanvas(cols * cell, rows * cell);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#12162a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  WEAPONS.forEach((weapon, i) => {
    const cx = (i % cols) * cell + cell / 2;
    const cy = Math.floor(i / cols) * cell + cell / 2;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.strokeRect((i % cols) * cell + 2, Math.floor(i / cols) * cell + 2, cell - 4, cell - 4);
    ctx.translate(cx + 22, cy - 6);
    ctx.scale(0.72, 0.72);
    ctx.rotate(-0.1);
    ctx.translate(-44, 0);
    drawRig(ctx, weapon.rig);
    ctx.restore();
    ctx.fillStyle = "#cfd6ea";
    ctx.font = "600 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${weapon.emoji} ${weapon.name}`, cx, cy + 78);
  });

  fs.writeFileSync(path.join(outDir, "weapons-sheet.png"), canvas.toBuffer("image/png"));
  console.log("wrote tmp/weapons-sheet.png");
}

/* ── strike sequence frames ─────────────────────────────────────────────── */
const width = 430;
const height = 780;

function frame(weaponId, progress, name) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const bg = new Background();
  bg.resize(width, height, 1);
  const doll = new Doll();
  doll.resize(width, height);
  for (let i = 0; i < 30; i += 1) {
    doll.update(1 / 60);
    bg.update(1 / 60, null);
  }
  const attacker = new Attacker();
  const torso = doll.world.torso;
  const target = {
    x: doll.basePosition.x + 18 * doll.scale,
    y: torso.wy - torso.lenPx * 0.55,
  };
  const swing = attacker.start(WEAPON_BY_ID[weaponId], target, {
    width,
    height,
    unit: Math.min(width, height) / 430,
  });
  swing.elapsed = swing.duration * progress;

  ctx.fillStyle = "#0b0e19";
  ctx.fillRect(0, 0, width, height);
  bg.draw(ctx);
  doll.draw(ctx);
  attacker.draw(ctx, { unit: Math.min(width, height) / 430 });
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, 210, 34);
  ctx.fillStyle = "#fff";
  ctx.font = "700 15px sans-serif";
  ctx.fillText(`${weaponId} · ${Math.round(progress * 100)}%`, 12, 23);
  fs.writeFileSync(path.join(outDir, `${name}.png`), canvas.toBuffer("image/png"));
  console.log("wrote", `tmp/${name}.png`);
}

frame("punch", 0.3, "swing-punch-windup");
frame("punch", 0.68, "swing-punch-impact");
frame("kick", 0.45, "swing-kick-mid");
frame("bat", 0.71, "swing-bat-impact");
frame("pan", 0.72, "swing-pan-impact");
frame("anvil", 0.64, "swing-anvil-impact");
frame("hammer", 0.64, "swing-hammer-impact");
frame("glove", 0.71, "swing-glove-impact");
frame("fish", 0.7, "swing-fish-impact");
frame("saw", 0.46, "swing-saw-bite");
frame("rocket", 0.5, "swing-rocket-flight");
