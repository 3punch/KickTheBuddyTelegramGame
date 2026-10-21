import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"]);
const AUDIO_EXT = new Set([".mp3", ".ogg", ".oga", ".wav", ".m4a", ".aac", ".opus", ".webm"]);
const VOICE_EVENTS = ["hit", "ouch", "ko", "taunt", "swing", "special", "coin"];

const ASSETS_DIR = path.join(config.webRoot, "assets");
export const MANIFEST_PATH = path.join(ASSETS_DIR, "manifest.json");

const titleCase = (value) =>
  value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

function listDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function publicUrl(...parts) {
  return `/assets/${parts.map((p) => encodeURIComponent(p)).join("/")}`;
}

function readMeta(dir, id) {
  const file = path.join(dir, `${id}.json`);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Scan web/assets and build a manifest the client uses to populate the Studio.
 *
 * Drop-in conventions (hot-swappable content — no code changes required):
 *   web/assets/backgrounds/<id>.(png|jpg|webp)      -> a background
 *   web/assets/faces/<id>.png                        -> a face photo / sticker
 *   web/assets/dolls/<id>.png                        -> a full-body cut-out doll
 *   web/assets/voice/<pack>/hit-1.mp3                -> a clip for event "hit"
 *   (event prefixes: hit | ouch | ko | taunt | swing | special | coin)
 */
export function scanAssets() {
  const manifest = {
    generatedAt: new Date().toISOString(),
    backgrounds: [],
    faces: [],
    dolls: [],
    voicePacks: [],
  };

  const bgDir = path.join(ASSETS_DIR, "backgrounds");
  for (const entry of listDir(bgDir)) {
    if (!entry.isFile() || !IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) continue;
    const id = path.parse(entry.name).name;
    const meta = readMeta(bgDir, id);
    manifest.backgrounds.push({
      id,
      name: meta.name || titleCase(id),
      url: publicUrl("backgrounds", entry.name),
      fit: meta.fit || "cover",
      dim: meta.dim ?? 0,
    });
  }

  const faceDir = path.join(ASSETS_DIR, "faces");
  for (const entry of listDir(faceDir)) {
    if (!entry.isFile() || !IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) continue;
    const id = path.parse(entry.name).name;
    const meta = readMeta(faceDir, id);
    manifest.faces.push({
      id,
      name: meta.name || titleCase(id),
      url: publicUrl("faces", entry.name),
      scale: meta.scale ?? 1,
      offsetX: meta.offsetX ?? 0,
      offsetY: meta.offsetY ?? 0,
      rotate: meta.rotate ?? 0,
      round: meta.round !== false,
    });
  }

  const dollDir = path.join(ASSETS_DIR, "dolls");
  for (const entry of listDir(dollDir)) {
    if (!entry.isFile() || !IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) continue;
    const id = path.parse(entry.name).name;
    const meta = readMeta(dollDir, id);
    manifest.dolls.push({
      id,
      name: meta.name || titleCase(id),
      url: publicUrl("dolls", entry.name),
      height: meta.height ?? 520,
      pivotY: meta.pivotY ?? 0.5,
    });
  }

  const voiceRoot = path.join(ASSETS_DIR, "voice");
  for (const entry of listDir(voiceRoot)) {
    if (!entry.isDirectory()) continue;
    const packDir = path.join(voiceRoot, entry.name);
    const meta = readMeta(voiceRoot, entry.name);
    const clips = {};
    for (const file of listDir(packDir)) {
      if (!file.isFile() || !AUDIO_EXT.has(path.extname(file.name).toLowerCase())) continue;
      const base = path.parse(file.name).name.toLowerCase();
      const event = VOICE_EVENTS.find((name) => base === name || base.startsWith(`${name}-`) || base.startsWith(`${name}_`));
      if (!event) continue;
      (clips[event] ||= []).push(publicUrl("voice", entry.name, file.name));
    }
    if (!Object.keys(clips).length) continue;
    for (const key of Object.keys(clips)) clips[key].sort();
    manifest.voicePacks.push({
      id: entry.name,
      name: meta.name || titleCase(entry.name),
      language: meta.language || "en",
      pitch: meta.pitch ?? 1,
      clips,
    });
  }

  manifest.backgrounds.sort((a, b) => a.name.localeCompare(b.name));
  manifest.faces.sort((a, b) => a.name.localeCompare(b.name));
  manifest.dolls.sort((a, b) => a.name.localeCompare(b.name));
  manifest.voicePacks.sort((a, b) => a.name.localeCompare(b.name));
  return manifest;
}

let cache = null;
let cacheStamp = 0;

export function getManifest({ force = false } = {}) {
  const stamp = fs.existsSync(MANIFEST_PATH) ? fs.statSync(MANIFEST_PATH).mtimeMs : 0;
  if (!force && cache && stamp === cacheStamp) return cache;
  try {
    if (!force && stamp) {
      cache = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
      cacheStamp = stamp;
      return cache;
    }
  } catch (error) {
    console.warn("[assets] manifest unreadable, rescanning:", error.message);
  }
  cache = scanAssets();
  cacheStamp = stamp;
  return cache;
}

export function writeManifest() {
  const manifest = scanAssets();
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  cache = manifest;
  cacheStamp = fs.existsSync(MANIFEST_PATH) ? fs.statSync(MANIFEST_PATH).mtimeMs : 0;
  return manifest;
}
