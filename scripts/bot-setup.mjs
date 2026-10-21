/**
 * One-shot bot configuration: commands, texts, menu button and webhook.
 * Usage: BOT_TOKEN=… PUBLIC_URL=… npm run bot:setup
 */
import { config, botEnabled } from "../server/config.js";
import { callTelegram, getMe, syncWebhook, syncMenuButton } from "../server/telegram.js";

if (!botEnabled()) {
  console.error("BOT_TOKEN is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const commands = [
  { command: "play", description: "Open the game 🥊" },
  { command: "top", description: "Global leaderboard 🏆" },
  { command: "me", description: "Your stats 📊" },
  { command: "help", description: "How to play ❓" },
];

const steps = [
  ["getMe", () => getMe()],
  ["setMyCommands", () => callTelegram("setMyCommands", { commands })],
  [
    "setMyShortDescription",
    () =>
      callTelegram("setMyShortDescription", {
        short_description: "Kick the Professor — a physics beat-'em-up inside Telegram.",
      }),
  ],
  [
    "setMyDescription",
    () =>
      callTelegram("setMyDescription", {
        description:
          "🥊 Kick the Professor\n\n" +
          "The Professor kept you after class — time for revenge. Kick, punch and swing " +
          "9 weapons, break his HP, build combos, earn coins and climb the global " +
          "leaderboard. Swap his face, the background and the voice in the Studio.",
      }),
  ],
  ["setChatMenuButton", () => syncMenuButton()],
  ["setWebhook", () => syncWebhook()],
];

let failed = 0;
for (const [name, run] of steps) {
  try {
    const result = await run();
    console.log(`✅ ${name}`, result && typeof result === "object" ? JSON.stringify(result).slice(0, 160) : "");
  } catch (error) {
    failed += 1;
    console.error(`❌ ${name}: ${error.message}`);
  }
}

console.log(
  `\nPublic URL: ${config.publicUrl || "(not set — set PUBLIC_URL for the webhook + menu button)"}`
);
process.exit(failed ? 1 : 0);
