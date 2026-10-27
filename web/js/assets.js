/* Image loading, server manifest, and client-side image compression. */

const imageCache = new Map();

export function loadImage(url) {
  if (!url) return Promise.resolve(null);
  if (imageCache.has(url)) return imageCache.get(url);
  const promise = new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    // A corrupt asset (or a WebView that never decodes) must not block boot.
    const timer = setTimeout(() => {
      console.warn("[assets] image timed out:", url);
      done(null);
    }, 8000);
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = url;
  });
  imageCache.set(url, promise);
  return promise;
}

export function getCachedImage(url) {
  const promise = imageCache.get(url);
  if (!promise) return null;
  let found = null;
  promise.then((img) => {
    found = img;
  });
  return found;
}

const EMPTY_MANIFEST = { backgrounds: [], faces: [], dolls: [], voicePacks: [] };

export async function fetchConfig() {
  try {
    const res = await fetch("/api/config", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`config ${res.status}`);
    const data = await res.json();
    return {
      demoMode: Boolean(data.demoMode),
      startCoins: data.startCoins ?? 250,
      assets: { ...EMPTY_MANIFEST, ...(data.assets || {}) },
      ok: true,
    };
  } catch (error) {
    console.warn("[assets] config unavailable", error.message);
    return { demoMode: true, startCoins: 250, assets: EMPTY_MANIFEST, ok: false };
  }
}

export function findAsset(manifest, slot, id) {
  if (!id || !manifest) return null;
  const list =
    slot === "face"
      ? manifest.faces
      : slot === "background"
        ? manifest.backgrounds
        : slot === "doll"
          ? manifest.dolls
          : [];
  return list.find((item) => item.id === id) || null;
}

/**
 * Downscale + re-encode an image file so it fits comfortably in localStorage.
 * Returns a data URL.
 */
export async function compressImage(file, { maxSide = 1000, mime = "image/webp", quality = 0.86 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("cannot_decode_image"));
      image.src = url;
    });
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL(mime, quality);
    // Some browsers ignore the requested mime and fall back to PNG — fine,
    // but re-encode very large results as JPEG to stay under the quota.
    if (dataUrl.length > 2_400_000 && mime !== "image/jpeg") {
      return canvas.toDataURL("image/jpeg", 0.82);
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function pickFile({ accept = "image/*" } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.addEventListener("change", () => {
      resolve(input.files?.[0] || null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}
