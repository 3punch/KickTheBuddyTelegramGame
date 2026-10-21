/**
 * Dev-only visual snapshot: renders the doll + stage to PNG files so the art
 * can be reviewed without a browser. Requires the optional @napi-rs/canvas
 * dev dependency. Run: node scripts/render-preview.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let Canvas;
try {
  ({ createCanvas: Canvas } = await import("@napi-rs/canvas"));
} catch {
  console.error("Install the optional dev dependency: npm i -D @napi-rs/canvas");
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outDir = path.join(root, "tmp");
fs.mkdirSync(outDir, { recursive: true });

// minimal DOM shim for the background's offscreen canvas
globalThis.document = {
  createElement(tag) {
    if (tag === "canvas") return Canvas(8, 8);
    return {};
  },
};

const { Doll } = await import("../web/js/doll.js");
const { Background } = await import("../web/js/background.js");

const width = 430;
const height = 780;

function makeStage() {
  const canvas = Canvas(width, height);
  const ctx = canvas.getContext("2d");
  const bg = new Background();
  bg.resize(width, height, 1);
  const doll = new Doll();
  doll.resize(width, height);
  return { canvas, ctx, bg, doll };
}

function render(name, { frames = 40, expression = "idle", pose = null, koAt = null } = {}) {
  const { canvas, ctx, bg, doll } = makeStage();
  for (let i = 0; i < frames; i += 1) {
    doll.setPointer(width * 0.7, height * 0.3);
    doll.update(1 / 60);
    bg.update(1 / 60, { x: width * 0.62, y: height * 0.4 });
  }
  doll.expression = expression;
  if (pose) pose(doll);
  if (koAt !== null) {
    doll.ko(2.4);
    for (let i = 0; i < koAt; i += 1) doll.update(1 / 60);
  }
  ctx.fillStyle = "#0b0e19";
  ctx.fillRect(0, 0, width, height);
  bg.draw(ctx);
  doll.draw(ctx);
  fs.writeFileSync(path.join(outDir, `${name}.png`), canvas.toBuffer("image/png"));
  console.log("wrote", path.join("tmp", `${name}.png`));
}

render("preview-idle");
render("preview-hurt", {
  expression: "hurt",
  pose: (doll) => {
    doll.bandaids.push({ u: 0.3, v: 0.4, rot: 0.3, where: "head" });
    doll.bandaids.push({ u: -0.1, v: 0.5, rot: -0.4, where: "chest" });
    doll.stun = 1;
  },
});
render("preview-ko", { koAt: 70 });
render("preview-rage", { expression: "rage", pose: (doll) => { doll.stun = 1; } });

// face-swap preview (uses the bundled sample face + a photo-ish gradient)
try {
  const { loadImage } = await import("@napi-rs/canvas");
  const dean = await loadImage(path.join(root, "web/assets/faces/dean.svg"));
  const { canvas, ctx, bg, doll } = makeStage();
  for (let i = 0; i < 40; i += 1) {
    doll.update(1 / 60);
    bg.update(1 / 60, null);
  }
  doll.setFace(dean, { scale: 1.02, offsetY: 0.02 });
  ctx.fillStyle = "#0b0e19";
  ctx.fillRect(0, 0, width, height);
  bg.draw(ctx);
  doll.draw(ctx);
  fs.writeFileSync(path.join(outDir, "preview-face.png"), canvas.toBuffer("image/png"));
  console.log("wrote tmp/preview-face.png");
} catch (error) {
  console.warn("face preview skipped:", error.message);
}
