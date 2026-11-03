/* Telegram Mini App bridge with graceful web fallback. */

const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : null;
const PREVIEW_GUEST_KEY = "ktp.preview.guest.v1";
let cachedPreviewGuestId = null;

/** Stable anonymous browser key used only when the server is in preview mode. */
export function previewGuestId() {
  if (cachedPreviewGuestId) return cachedPreviewGuestId;
  try {
    const existing = localStorage.getItem(PREVIEW_GUEST_KEY);
    if (existing && /^[a-z0-9-]{16,80}$/i.test(existing)) {
      cachedPreviewGuestId = existing;
      return existing;
    }
  } catch {
    // Private mode / blocked storage: keep an in-memory id for this page load.
  }
  const secure = globalThis.crypto;
  cachedPreviewGuestId = secure?.randomUUID?.() || (() => {
    const bytes = new Uint8Array(16);
    if (secure?.getRandomValues) secure.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  })();
  try {
    localStorage.setItem(PREVIEW_GUEST_KEY, cachedPreviewGuestId);
  } catch {
    // Session still works; it just will not survive a reload without storage.
  }
  return cachedPreviewGuestId;
}

export const isTelegram = Boolean(tg && tg.initData);
export const platform = tg?.platform || "web";

export function initTelegram() {
  if (!tg) return;
  try {
    tg.ready?.();
    tg.expand?.();
    // Bot API 7.7+: full height sheet, and 8.0: fullscreen if available.
    tg.requestFullscreen?.();
    tg.disableVerticalSwipes?.();
    tg.setHeaderColor?.("#080a12");
    tg.setBackgroundColor?.("#080a12");
    tg.enableClosingConfirmation?.();
    tg.lockOrientation?.("portrait");
    tg.onEvent?.("fullscreen_failed", () => {});
  } catch {
    /* older clients — ignore */
  }
}

export function tgUser() {
  return tg?.initDataUnsafe?.user || null;
}

export function initData() {
  return tg?.initData || "";
}

export function startParam() {
  return tg?.initDataUnsafe?.start_param || null;
}

export function themeParams() {
  return tg?.themeParams || null;
}

/** Native haptics, silently no-ops outside Telegram. */
export function haptic(kind = "light") {
  const h = tg?.HapticFeedback;
  if (!h) return false;
  try {
    switch (kind) {
      case "light":
        h.impactOccurred("light");
        break;
      case "medium":
        h.impactOccurred("medium");
        break;
      case "heavy":
        h.impactOccurred("heavy");
        break;
      case "rigid":
        h.impactOccurred("rigid");
        break;
      case "soft":
        h.impactOccurred("soft");
        break;
      case "success":
        h.notificationOccurred("success");
        break;
      case "warning":
        h.notificationOccurred("warning");
        break;
      case "error":
        h.notificationOccurred("error");
        break;
      case "select":
        h.selectionChanged();
        break;
      default:
        h.impactOccurred("light");
    }
    return true;
  } catch {
    return false;
  }
}

export function shareScore(_damage, text) {
  const url = window.location.href;
  if (navigator.share) {
    navigator.share({ text, url, title: "Kick the Professor" }).catch(() => {});
    return true;
  }
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(shareUrl);
    return true;
  }
  return false;
}

export function openTelegramLink(url) {
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, "_blank", "noopener");
}

export function closeApp() {
  tg?.close?.();
}

/** CloudStorage (Bot API 6.9) with localStorage fallback. */
export async function cloudGet(key) {
  const cs = tg?.CloudStorage;
  if (!cs) return null;
  return new Promise((resolve) => {
    try {
      cs.getItem(key, (err, value) => resolve(err ? null : value || null));
    } catch {
      resolve(null);
    }
  });
}

export async function cloudSet(key, value) {
  const cs = tg?.CloudStorage;
  if (!cs) return false;
  return new Promise((resolve) => {
    try {
      cs.setItem(key, value, (err) => resolve(!err));
    } catch {
      resolve(false);
    }
  });
}

/** Ask the user to review / rate — nice retention touch. */
export function canRate() {
  return Boolean(tg?.isVersionAtLeast?.("7.0"));
}
