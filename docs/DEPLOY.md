# Deploying the Mini App

## Requirements

* Node **22.5+** (uses the built-in `node:sqlite`; the runtime has **zero** npm deps)
* A public **HTTPS** URL — Telegram refuses to open Mini Apps over plain HTTP
* A bot token from [@BotFather](https://t.me/BotFather)

## 1. Local development with a tunnel

```bash
npm install
BOT_TOKEN=123456:ABC USE_POLLING=1 npm start      # game on http://localhost:8080

# in a second shell
ngrok http 8080        # or: cloudflared tunnel --url http://localhost:8080
```

With `USE_POLLING=1` the bot works without a public URL (it long-polls
`getUpdates`), which is handy for testing commands. The **Mini App** itself
still needs HTTPS — point BotFather's menu button at your tunnel URL, or set
`PUBLIC_URL` to the tunnel and let the server configure it.

## 2. Webhook mode (production)

```bash
cp .env.example .env
```

```dotenv
BOT_TOKEN=123456:ABC-DEF…
PUBLIC_URL=https://kick.example.com
WEBHOOK_SECRET=<openssl rand -hex 24>
PORT=8080
HOST=0.0.0.0
DB_PATH=./data/game.db
ADMIN_IDS=123456789
```

```bash
npm start          # registers https://kick.example.com/telegram/webhook/<secret>
npm run bot:setup  # optional: bot description + command list
```

The server calls `setWebhook` with `secret_token`, and every incoming update is
checked against `X-Telegram-Bot-Api-Secret-Token`, so only Telegram can post to
the endpoint. It also calls `setChatMenuButton` so the 🥊 button is always one
tap away.

## 3. Reverse proxy (nginx example)

```nginx
server {
  listen 443 ssl http2;
  server_name kick.example.com;

  ssl_certificate     /etc/letsencrypt/live/kick.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/kick.example.com/privkey.pem;

  client_max_body_size 1m;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 65s;   # long polling safety
  }
}
```

## 4. systemd unit

```ini
[Unit]
Description=Kick the Professor
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/kick
ExecStart=/usr/bin/node server/index.js
EnvironmentFile=/srv/kick/.env
Restart=always
RestartSec=3
User=kick

[Install]
WantedBy=multi-user.target
```

## 5. Container

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY web ./web
COPY scripts ./scripts
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
RUN mkdir -p data && chown -R node:node /app
USER node
EXPOSE 8080
CMD ["node", "server/index.js"]
```

Mount a volume at `/app/data` so the SQLite database survives redeploys.

## Environment reference

| Variable | Default | Purpose |
| --- | --- | --- |
| `BOT_TOKEN` | – | Bot API token. Empty ⇒ preview mode |
| `PUBLIC_URL` | – | HTTPS origin used for the webhook + menu button |
| `WEBHOOK_SECRET` | `change-me-please` | Path secret **and** update header check |
| `PORT` / `HOST` | `8080` / `0.0.0.0` | HTTP bind |
| `DB_PATH` | `./data/game.db` | SQLite file (created automatically) |
| `USE_POLLING` | `0` | `1` = long polling instead of webhook |
| `ADMIN_IDS` | – | Comma-separated Telegram ids (reserved for admin tools) |
| `START_COINS` | `250` | Coins handed to new players |

## Operations tips

* **Backups:** `data/game.db` is the only mutable state. `sqlite3 game.db ".backup backup.db"`.
* **Scaling:** the server is stateless apart from SQLite; for multiple instances
  point `DB_PATH` at a shared volume or swap `server/db.js` for Postgres.
* **Rate limiting:** `/api/score` already throttles each player to one submission
  every 2 s and caps a round at 5 000 000 damage. Put a proxy-level limit in front
  if you expect abuse.
* **Telegram limits:** keep the Mini App bundle small — it currently ships a few
  hundred KB of JS/CSS and no external images or audio.
* **Assets:** if you add files to `web/assets/`, restart the service (the manifest
  is generated at boot) or run `npm run assets` and the server picks it up on the
  next request.
