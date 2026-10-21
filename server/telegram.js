import { config, botEnabled } from "./config.js";
import { leaderboard, getPlayer, recordRound, globalStats } from "./db.js";

const API = (method) => `https://api.telegram.org/bot${config.botToken}/${method}`;

/** Thin Bot API client — no third-party dependency. */
export async function callTelegram(method, payload = {}) {
  if (!botEnabled()) throw new Error("BOT_TOKEN is not configured");
  const res = await fetch(API(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description || res.status}`);
  }
  return data.result;
}

export const getMe = () => callTelegram("getMe");

const TEXTS = {
  en: {
    rtl: false,
    start: (name) =>
      `🥊 <b>Kick the Professor</b>\n\n` +
      `Hey ${name}! The Professor is back in class and he deserves a lesson.\n\n` +
      `• Kick, punch and swing <b>9 weapons</b>\n` +
      `• Break his HP, score combos, earn coins\n` +
      `• Upgrade your power and unlock new gear\n` +
      `• Swap his face, the background and the voice in the <b>Studio</b>\n\n` +
      `Tap the button below to start 👇`,
    play: "▶️ Play now",
    help:
      `/play — open the game\n` +
      `/top — global leaderboard\n` +
      `/me — your stats\n` +
      `/help — this message\n\n` +
      `Everything runs inside Telegram — no install needed.`,
    notEnough: "No data yet.",
  },
  ar: {
    rtl: true,
    start: (name) =>
      `🥊 <b>اضرب البروفيسور</b>\n\n` +
      `أهلاً ${name}! عاد البروفيسور إلى الصف ويستحق درساً لن ينساه.\n\n` +
      `• ركل ولكم و<b>٩ أسلحة</b>\n` +
      `• حطّم نقاط صحته، اصنع كومبو، واجمع العملات\n` +
      `• طوّر قوتك وافتح أسلحة جديدة\n` +
      `• غيّر وجهه والخلفية والصوت من <b>الاستوديو</b>\n\n` +
      `اضغط الزر أدناه للبدء 👇`,
    play: "▶️ ابدأ اللعب",
    help:
      `/play — فتح اللعبة\n` +
      `/top — المتصدرون\n` +
      `/me — إحصائياتك\n` +
      `/help — المساعدة\n\n` +
      `كل شيء داخل تلغرام — بدون تثبيت.`,
    notEnough: "لا توجد بيانات بعد.",
  },
  de: {
    rtl: false,
    start: (name) =>
      `🥊 <b>Kick den Professor</b>\n\n` +
      `Hallo ${name}! Der Professor ist zurück und hat eine Abreibung verdient.\n\n` +
      `• Kicken, boxen und <b>9 Waffen</b> nutzen\n` +
      `• HP zerstören, Combos bauen, Münzen sammeln\n` +
      `• Kraft verbessern und Ausrüstung freischalten\n` +
      `• Gesicht, Hintergrund und Stimme im <b>Studio</b> tauschen\n\n` +
      `Tippe unten, um zu starten 👇`,
    play: "▶️ Jetzt spielen",
    help:
      `/play — Spiel öffnen\n` +
      `/top — Rangliste\n` +
      `/me — Deine Statistik\n` +
      `/help — Hilfe\n\n` +
      `Läuft komplett in Telegram — keine Installation.`,
    notEnough: "Noch keine Daten.",
  },
};

export function botStrings(langCode = "en") {
  const lang = String(langCode || "").slice(0, 2).toLowerCase();
  return TEXTS[lang] || TEXTS.en;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function playKeyboard(t) {
  if (!config.publicUrl) return undefined;
  return {
    inline_keyboard: [[{ text: t.play, web_app: { url: config.publicUrl } }]],
  };
}

function formatNumber(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(n || 0));
}

export async function sendMessage(chatId, text, extra = {}) {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

/** Register the webhook (or delete it when polling / preview mode). */
export async function syncWebhook() {
  if (!botEnabled()) return { ok: false, reason: "bot_disabled" };
  if (config.usePolling) {
    await callTelegram("deleteWebhook", { drop_pending_updates: false });
    return { ok: true, mode: "polling" };
  }
  if (!config.publicUrl) {
    await callTelegram("deleteWebhook", { drop_pending_updates: false });
    return { ok: false, reason: "no_public_url" };
  }
  const url = `${config.publicUrl}/telegram/webhook/${config.webhookSecret}`;
  await callTelegram("setWebhook", {
    url,
    secret_token: config.webhookSecret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  return { ok: true, mode: "webhook", url };
}

/** Point the bot's "menu" button at the Mini App. */
export async function syncMenuButton() {
  if (!botEnabled() || !config.publicUrl) return { ok: false };
  await callTelegram("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "🥊 Kick the Professor",
      web_app: { url: config.publicUrl },
    },
  });
  return { ok: true };
}

async function handleTop(chatId, t) {
  const rows = leaderboard({ limit: 10 });
  if (!rows.length) return sendMessage(chatId, t.notEnough);
  const medals = ["🥇", "🥈", "🥉"];
  const lines = rows.map((row, i) => {
    const medal = medals[i] || `${i + 1}.`;
    const name = escapeHtml(row.first_name || row.username || "Player");
    return `${medal} ${name} — <b>${formatNumber(row.total_damage)}</b>`;
  });
  return sendMessage(
    chatId,
    `<b>🏆 Leaderboard</b>\n<i>total damage</i>\n\n${lines.join("\n")}`
  );
}

async function handleMe(chatId, user, t) {
  const row = getPlayer(user.id);
  if (!row) return sendMessage(chatId, t.notEnough);
  return sendMessage(
    chatId,
    `<b>📊 Your stats</b>\n\n` +
      `Total damage: <b>${formatNumber(row.total_damage)}</b>\n` +
      `Best round: <b>${formatNumber(row.best_round)}</b>\n` +
      `Best combo: <b>${row.best_combo}x</b>\n` +
      `Knockouts: <b>${row.kos}</b>\n` +
      `Rounds: <b>${row.rounds}</b>`
  );
}

/** Handle one Telegram update. */
export async function handleUpdate(update) {
  const message = update.message || update.edited_message;
  if (message?.text) {
    const chatId = message.chat.id;
    const user = message.from || {};
    const t = botStrings(user.language_code);
    const command = message.text.trim().split(/\s+/)[0].split("@")[0].toLowerCase();
    const name = escapeHtml(user.first_name || "champ");

    try {
      switch (command) {
        case "/start":
        case "/play":
          await sendMessage(chatId, t.start(name), { reply_markup: playKeyboard(t) });
          break;
        case "/top":
        case "/leaderboard":
          await handleTop(chatId, t);
          break;
        case "/me":
        case "/stats":
          await handleMe(chatId, user, t);
          break;
        case "/help":
          await sendMessage(chatId, t.help);
          break;
        default:
          // Ignore arbitrary chatter, but answer the first message politely.
          if (!message.text.startsWith("/")) return;
          await sendMessage(chatId, t.help);
      }
    } catch (error) {
      console.error("[telegram] handler error", error);
    }
    return;
  }

  if (update.callback_query) {
    try {
      await callTelegram("answerCallbackQuery", {
        callback_query_id: update.callback_query.id,
      });
    } catch (error) {
      console.error("[telegram] callback error", error);
    }
  }
}

/** Long polling loop (used when USE_POLLING=1). */
export async function startPolling(signal) {
  let offset = 0;
  console.log("[telegram] polling started");
  while (!signal.aborted) {
    try {
      const result = await callTelegram("getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message", "callback_query"],
      });
      for (const update of result) {
        offset = update.update_id + 1;
        await handleUpdate(update);
      }
    } catch (error) {
      console.error("[telegram] poll error:", error.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

export { globalStats, recordRound };
