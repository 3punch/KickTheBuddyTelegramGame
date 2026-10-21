#!/usr/bin/env node
/**
 * Asset importer — puts your photo / background / voice files into the right
 * folder, resizes and converts them, writes the optional metadata JSON, and
 * rebuilds the manifest so they show up in the Studio immediately.
 *
 *   npm run assets:add -- face C:\pics\prof.jpg --id prof --remove-bg --tight
 *   npm run assets:add -- background C:\pics\class.jpg --id classroom2
 *   npm run assets:add -- doll C:\pics\buddy.png --id buddy
 *   npm run assets:add -- voice prof hit C:\voice\hit-1.mp3 --name "Prof Pack" --language en
 *   npm run assets:add -- list
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../server/config.js";

const ASSETS = path.join(ROOT, "web", "assets");
const TMP = path.join(ROOT, "tmp");
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);
const AUDIO_EXT = new Set([".mp3", ".ogg", ".oga", ".wav", ".m4a", ".aac", ".opus"]);
const VOICE_EVENTS = ["hit", "ouch", "ko", "taunt", "swing", "special", "coin"];
const SLOT_DIRS = { face: "faces", background: "backgrounds", doll: "dolls", voice: "voice" };

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

const argv = process.argv.slice(2);
const command = argv[0];
const positional = [];
const options = {};
for (let i = 1; i < argv.length; i += 1) {
  const token = argv[i];
  if (token.startsWith("--")) {
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = true;
    }
  } else if (command) {
    positional.push(token);
  }
}

const usage = () => {
  console.log(`
${c.bold("Kick the Professor — asset importer")}

  ${c.cyan("face")} <file>        [--id prof] [--name "Professor"] [--scale 1]
                        [--offset-x 0] [--offset-y 0] [--rotate 0]
                        [--remove-bg] [--tolerance 36] [--tight] [--size 720]
  ${c.cyan("background")} <file> [--id lab] [--name "Lab"] [--size 1600] [--dim 0.1]
  ${c.cyan("doll")} <file>       [--id buddy] [--name "Buddy"] [--size 800]
                        [--height 520] [--pivot-y 0.5] [--remove-bg]
  ${c.cyan("voice")} <pack> <event> <file>
                        [--name "Prof Pack"] [--language en] [--pitch 1]
                        events: ${VOICE_EVENTS.join(", ")}
  ${c.cyan("list")}              show what is currently installed

  Common flags: --force (overwrite), --no-preview, --no-manifest
`);
};

const slug = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const titleCase = (value) =>
  String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

function fail(message) {
  console.error(c.red(`✖ ${message}`));
  process.exit(1);
}

function requireFile(file, allowed) {
  if (!file) fail("Missing input file. Run with --help for usage.");
  const abs = path.resolve(file);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) fail(`File not found: ${abs}`);
  const ext = path.extname(abs).toLowerCase();
  if (allowed && !allowed.has(ext)) {
    fail(`Unsupported format "${ext}". Allowed: ${[...allowed].join(", ")}`);
  }
  return abs;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeMeta(dir, id, meta) {
  const clean = Object.fromEntries(
    Object.entries(meta).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
  const file = path.join(dir, `${id}.json`);
  if (!Object.keys(clean).length) {
    fs.existsSync(file) && fs.unlinkSync(file);
    return null;
  }
  fs.writeFileSync(file, `${JSON.stringify(clean, null, 2)}\n`);
  return file;
}

function mergeMeta(dir, id, meta) {
  const file = path.join(dir, `${id}.json`);
  let existing = {};
  if (fs.existsSync(file)) {
    try {
      existing = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      existing = {};
    }
  }
  return writeMeta(dir, id, { ...existing, ...meta });
}

async function loadCanvas() {
  try {
    const mod = await import("@napi-rs/canvas");
    return { createCanvas: mod.createCanvas, loadImage: mod.loadImage };
  } catch {
    return null;
  }
}

/* ── background keying ──────────────────────────────────────────────────── */

function keyOutBackground(ctx, width, height, tolerance = 36, sample = 14) {
  const data = ctx.getImageData(0, 0, width, height);
  const px = data.data;
  const at = (x, y) => (y * width + x) * 4;

  // Sample the frame of the image to find the dominant "background" colour.
  const buckets = new Map();
  const push = (x, y) => {
    const i = at(x, y);
    const key = `${px[i] >> 3},${px[i + 1] >> 3},${px[i + 2] >> 3}`;
    const entry = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    entry.count += 1;
    entry.r += px[i];
    entry.g += px[i + 1];
    entry.b += px[i + 2];
    buckets.set(key, entry);
  };
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 40))) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 40))) {
    push(0, y);
    push(width - 1, y);
  }
  let best = null;
  for (const entry of buckets.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  if (!best) return { removed: 0 };
  const keyColor = [best.r / best.count, best.g / best.count, best.b / best.count];

  const limit = tolerance * tolerance * 3;
  const matches = (i) => {
    const dr = px[i] - keyColor[0];
    const dg = px[i + 1] - keyColor[1];
    const db = px[i + 2] - keyColor[2];
    return dr * dr + dg * dg + db * db <= limit;
  };

  // Flood fill from the border so interior matching colours survive.
  const stack = [];
  const seen = new Uint8Array(width * height);
  for (let x = 0; x < width; x += 1) {
    stack.push([x, 0], [x, height - 1]);
  }
  for (let y = 0; y < height; y += 1) {
    stack.push([0, y], [width - 1, y]);
  }

  let removed = 0;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const cell = y * width + x;
    if (seen[cell]) continue;
    seen[cell] = 1;
    const i = cell * 4;
    if (px[i + 3] === 0) continue;
    if (!matches(i)) continue;
    px[i + 3] = 0;
    removed += 1;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  // Soften the cut edge so photos don't look like stickers.
  for (let pass = 0; pass < 2; pass += 1) {
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = at(x, y);
        if (px[i + 3] > 0) continue;
        let neighbours = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const j = at(x + dx, y + dy);
          if (px[j + 3] > 0) neighbours += 1;
        }
        if (neighbours >= 3) {
          // keep a faint rim for a smoother edge
          px[i] = keyColor[0];
          px[i + 1] = keyColor[1];
          px[i + 2] = keyColor[2];
          px[i + 3] = 40;
        }
      }
    }
  }

  ctx.putImageData(data, 0, 0);
  void sample;
  return { removed, keyColor };
}

function alphaBounds(ctx, width, height) {
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/* ── image import ───────────────────────────────────────────────────────── */

async function importImage(slot, file) {
  const canvasLib = await loadCanvas();
  const src = requireFile(file, IMAGE_EXT);
  const baseId = slug(options.id || path.basename(src));
  if (!baseId) fail("Could not derive an id — pass --id <name>.");
  const dir = ensureDir(path.join(ASSETS, SLOT_DIRS[slot] || slot));
  const maxSide = Number(options.size) || (slot === "background" ? 1600 : slot === "doll" ? 800 : 720);

  if (!canvasLib) {
    // No image toolchain available: copy the file untouched and keep going.
    const ext = path.extname(src).toLowerCase();
    const out = path.join(dir, `${baseId}${ext}`);
    fs.copyFileSync(src, out);
    console.log(c.yellow("! @napi-rs/canvas not installed — copied without resizing."));
    return finish(slot, baseId, out, null, null);
  }

  const { createCanvas, loadImage } = canvasLib;
  const image = await loadImage(src);
  const iw = image.width || image.naturalWidth;
  const ih = image.height || image.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));

  let canvas = createCanvas(w, h);
  let ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, w, h);

  let removed = 0;
  if ((options["remove-bg"] || options["remove-background"]) && slot !== "background") {
    const result = keyOutBackground(ctx, w, h, Number(options.tolerance) || 36);
    removed = result.removed || 0;
    if (!removed) {
      console.log(c.yellow("! No background pixels matched — try a higher --tolerance."));
    }
  }

  if (options.tight) {
    const bounds = alphaBounds(ctx, w, h);
    if (bounds) {
      const pad = Math.round(Math.min(bounds.w, bounds.h) * 0.04);
      const x = Math.max(0, bounds.x - pad);
      const y = Math.max(0, bounds.y - pad);
      const cw = Math.min(w - x, bounds.w + pad * 2);
      const ch = Math.min(h - y, bounds.h + pad * 2);
      // square it up around the content so the head mask frames nicely
      const side = Math.max(cw, ch);
      const sx = Math.max(0, Math.min(w - side, x - Math.floor((side - cw) / 2)));
      const sy = Math.max(0, Math.min(h - side, y - Math.floor((side - ch) / 2)));
      const cropped = createCanvas(Math.min(side, w), Math.min(side, h));
      cropped.getContext("2d").drawImage(canvas, sx, sy, side, side, 0, 0, side, side);
      canvas = cropped;
      ctx = canvas.getContext("2d");
    }
  }

  const outName = `${baseId}.${slot === "background" ? "jpg" : "png"}`;
  const out = path.join(dir, outName);
  const buffer = await (slot === "background" ? canvas.encode("jpeg", 90) : canvas.encode("png"));
  fs.writeFileSync(out, buffer);

  const meta = {
    name: options.name || titleCase(baseId),
    ...(slot === "face"
      ? {
          scale: options.scale !== undefined ? Number(options.scale) : undefined,
          offsetX: options["offset-x"] !== undefined ? Number(options["offset-x"]) : undefined,
          offsetY: options["offset-y"] !== undefined ? Number(options["offset-y"]) : undefined,
          rotate: options.rotate !== undefined ? Number(options.rotate) : undefined,
        }
      : {}),
    ...(slot === "background"
      ? { fit: options.fit, dim: options.dim !== undefined ? Number(options.dim) : undefined }
      : {}),
    ...(slot === "doll"
      ? {
          height: options.height !== undefined ? Number(options.height) : undefined,
          pivotY: options["pivot-y"] !== undefined ? Number(options["pivot-y"]) : undefined,
        }
      : {}),
  };

  console.log(
    `${c.green("✔")} ${slot} ${c.bold(`${baseId}`)} ${c.dim(`${iw}×${ih} → ${canvas.width}×${canvas.height}`)}` +
      (removed ? c.dim(` · ${removed.toLocaleString()} bg px removed`) : "")
  );
  return finish(slot, baseId, out, meta, canvas);
}

function finish(slot, id, outFile, meta, canvas) {
  const dir = path.dirname(outFile);
  if (meta) mergeMeta(dir, id, meta);
  const size = fs.statSync(outFile).size;
  console.log(`  ${c.dim(outFile.replace(ROOT + path.sep, ""))} ${c.dim(`(${Math.round(size / 1024)} KB)`)}`);
  if (canvas && !options["no-preview"] && (slot === "face" || slot === "doll")) {
    preview(slot, id).catch(() => {});
  }
  return { slot, id, file: outFile };
}

/* ── preview render ─────────────────────────────────────────────────────── */

async function preview(slot, id) {
  const canvasLib = await loadCanvas();
  if (!canvasLib) return;
  const { createCanvas, loadImage } = canvasLib;
  globalThis.document = globalThis.document || {
    createElement: (tag) => (tag === "canvas" ? createCanvas(8, 8) : {}),
  };

  const { Doll } = await import("../web/js/doll.js");
  const { Background } = await import("../web/js/background.js");

  const width = 430;
  const height = 780;
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

  const file = path.join(ASSETS, SLOT_DIRS[slot], `${id}.png`);
  const fallback = fs.existsSync(file) ? file : null;
  const image = fallback ? await loadImage(fallback) : null;
  if (slot === "face" && image) doll.setFace(image, { scale: Number(options.scale) || 1 });
  if (slot === "doll" && image) doll.setDollImage(image, { height: Number(options.height) || 520 });

  ctx.fillStyle = "#0b0e19";
  ctx.fillRect(0, 0, width, height);
  bg.draw(ctx);
  doll.draw(ctx);

  ensureDir(TMP);
  const out = path.join(TMP, `import-${slot}-${id}.png`);
  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  console.log(`  preview: ${c.cyan(path.relative(ROOT, out))}`);
}

/* ── voice import ───────────────────────────────────────────────────────── */

function importVoice(pack, event, file) {
  if (!pack) fail("Missing pack id. Example: voice prof hit C:\\voice\\hit-1.mp3");
  if (!VOICE_EVENTS.includes(event)) fail(`Unknown event "${event}". Use: ${VOICE_EVENTS.join(", ")}`);
  const src = requireFile(file, AUDIO_EXT);
  const packId = slug(pack) || "pack";
  const dir = ensureDir(path.join(ASSETS, SLOT_DIRS.voice, packId));
  const ext = path.extname(src).toLowerCase();
  const stem = slug(path.basename(src)) || event;
  const fileName = stem.startsWith(event) ? `${stem}${ext}` : `${event}-${stem}${ext}`;
  const out = path.join(dir, fileName);
  fs.copyFileSync(src, out);
  mergeMeta(
    path.join(ASSETS, "voice"),
    packId,
    {
      name: options.name || titleCase(packId),
      language: options.language || undefined,
      pitch: options.pitch !== undefined ? Number(options.pitch) : undefined,
    }
  );
  console.log(
    `${c.green("✔")} voice ${c.bold(packId)}/${event} ${c.dim(path.relative(ROOT, out))} ${c.dim(`(${Math.round(fs.statSync(out).size / 1024)} KB)`)}`
  );
  return { pack: packId, event, file: out };
}

/* ── list ───────────────────────────────────────────────────────────────── */

async function list() {
  const { getManifest } = await import("../server/assets.js");
  const manifest = getManifest({ force: true });
  const line = (label, items, fmt) =>
    console.log(
      `  ${label.padEnd(12)} ${items.length ? c.cyan(String(items.length)) : c.dim("0")}` +
        (items.length ? c.dim(`  ${items.map(fmt).join(", ")}`) : "")
    );
  console.log(c.bold("\nInstalled assets"));
  line("backgrounds", manifest.backgrounds, (item) => item.id);
  line("faces", manifest.faces, (item) => item.id);
  line("dolls", manifest.dolls, (item) => item.id);
  line("voice packs", manifest.voicePacks, (pack) => `${pack.id} (${Object.keys(pack.clips).length})`);
  console.log(c.dim("\nThey appear in 🎨 Studio on the next reload.\n"));
}

/* ── main ───────────────────────────────────────────────────────────────── */

async function rebuildManifest() {
  if (options["no-manifest"]) return;
  const { writeManifest } = await import("../server/assets.js");
  const manifest = writeManifest();
  console.log(
    c.dim(
      `  manifest rebuilt · ${manifest.backgrounds.length} bg / ${manifest.faces.length} face / ` +
        `${manifest.dolls.length} doll / ${manifest.voicePacks.length} voice pack(s)`
    )
  );
}

async function main() {
  if (!command || command === "help" || command === "--help" || options.help) {
    usage();
    return;
  }

  if (command === "list") {
    await list();
    return;
  }

  if ((command === "face" || command === "background" || command === "doll") && positional[0]) {
    await importImage(command, positional[0]);
    await rebuildManifest();
    return;
  }

  if (command === "voice") {
    importVoice(positional[0], positional[1], positional[2]);
    await rebuildManifest();
    return;
  }

  usage();
  process.exit(1);
}

main().catch((error) => {
  console.error(c.red(`✖ ${error.message}`));
  if (process.env.KTP_DEBUG) console.error(error);
  process.exit(1);
});
