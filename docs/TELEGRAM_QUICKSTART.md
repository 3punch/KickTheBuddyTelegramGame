# Start it on Telegram — 10-minute quickstart

You need two things: a **bot** and a **public HTTPS URL** (Telegram refuses to
open Mini Apps over plain HTTP).

---

## 1. Create the bot (2 min)

1. Open [@BotFather](https://t.me/BotFather) → `/newbot`.
2. Pick a name (`Kick the Professor`) and a username (`kickprofessor_bot`).
3. Copy the token: `123456789:AAH…` — this is `BOT_TOKEN`.

Optional but nice, all in BotFather:

| Command | Why |
| --- | --- |
| `/setdescription` | text shown on the bot's empty chat |
| `/setuserpic` | avatar |
| `/setcommands` | `/play /top /me /help` (or run `npm run bot:setup`) |

---

## 2. Give it an HTTPS address (2 min)

### Fastest: a tunnel to your machine

```bash
# terminal 1 — the game
npm install
npm start                     # http://localhost:8080

# terminal 2 — the HTTPS tunnel
cloudflared tunnel --url http://localhost:8080
#   → prints e.g. https://flat-moon-1234.trycloudflare.com

# or with ngrok
ngrok http 8080
```

Keep the tunnel running; the URL changes every time you restart the tunnel.

### Proper: a real server

Any VPS with a domain + TLS (Caddy does certificates automatically):

```
kick.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Details, nginx config, systemd unit and a Dockerfile: [DEPLOY.md](DEPLOY.md).

---

## 3. Configure and boot (1 min)

```bash
cp .env.example .env
```

```dotenv
BOT_TOKEN=123456789:AAH…
PUBLIC_URL=https://flat-moon-1234.trycloudflare.com
WEBHOOK_SECRET=pick-something-random
PORT=8080
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Then:

```bash
npm start
```

On boot the server logs:

```
[telegram] connected as @kickprofessor_bot
[telegram] webhook: { ok: true, mode: 'webhook', url: 'https://…/telegram/webhook/<secret>' }
[telegram] menu button: { ok: true }
```

That means: webhook registered, and the bot's **menu button** now opens the game.

> Prefer no webhook? Set `USE_POLLING=1` and the bot long-polls `getUpdates`
> instead (the Mini App still needs the HTTPS URL).

Optional extras:

```bash
npm run bot:setup    # bot description + /play /top /me /help command list
```

---

## 4. Play it

1. Open your bot in Telegram (`t.me/your_bot`).
2. Send `/start` → you get the intro card with a **▶️ Play now** button.
3. Tap it (or the **🥊 menu button** next to the message field). The Mini App
   opens full-screen, and your Telegram identity + score are verified server-side
   via `initData`.

Want a permanent shareable link like `t.me/your_bot/play`? In BotFather:
`/newapp` → pick your bot → short name `play` → URL = your `PUBLIC_URL`.

---

## 5. Check it worked

| Check | How |
| --- | --- |
| Server alive | `curl https://your-url/api/health` → `{"ok":true,…,"bot":true}` |
| Webhook registered | open `https://api.telegram.org/bot<TOKEN>/getWebhookInfo` |
| Scores saving | play a round → `/me` in the bot → damage appears |
| Leaderboard | `/top` in the bot, or the 🏆 Rank button in the game |

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| No **Play now** button in `/start` | `PUBLIC_URL` was empty when the server started → set it and restart. |
| Mini App opens blank / spins | Open `https://your-url/` in a browser. If that fails, the tunnel died or the proxy isn't forwarding. |
| "Button URL is invalid" | `PUBLIC_URL` isn't `https://` (or the certificate is broken). |
| Webhook 401/403 in logs | `WEBHOOK_SECRET` changed → just restart (the server re-registers it). |
| Scores not appearing on the leaderboard | You must open the game **from Telegram** (not the browser tab) or the server runs in preview mode because `BOT_TOKEN` is missing. |
| Tunnel URL changed after a restart | Update `PUBLIC_URL`, restart, done. |
| Sound doesn't play | Browsers/WebViews require a tap first — the first hit unlocks audio. |
| Mic recording blocked | Needs HTTPS (works inside Telegram, not on plain `http://`). |

---

## Handy

* **Stop / restart:** `Ctrl+C`, then `npm start` again.
* **Data:** everything mutable lives in `data/game.db` (players, rounds, scores).
  Delete it for a clean leaderboard.
* **Update content:** drop faces/backgrounds/dolls/voice packs into
  `web/assets/`, restart → they appear in the Studio for everyone
  ([ASSETS.md](ASSETS.md)).
* **Keep it running:** systemd or Docker — see [DEPLOY.md](DEPLOY.md).
