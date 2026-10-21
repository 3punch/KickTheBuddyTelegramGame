#!/usr/bin/env node
/**
 * Live mode: opens an HTTPS tunnel, wires PUBLIC_URL/WEBHOOK_SECRET and boots
 * the server in one command — no .env editing.
 *
 *   npm run live                 # auto-detect cloudflared or ngrok
 *   npm run live -- --tool ngrok
 *   npm run live -- --url https://my.domain.com   # already have HTTPS
 *   npm run live -- --save       # persist the tunnel URL into .env
 *   npm run live -- --dry-run    # resolve the URL, print config, exit
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config, ROOT } from "../server/config.js";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = args[i + 1];
  return value && !value.startsWith("--") ? value : true;
};
const has = (name) => args.includes(`--${name}`);

const port = Number(flag("port", config.port));
const dryRun = has("dry-run");
const save = has("save");
const explicitUrl = flag("url", null);
const requestedTool = flag("tool", null);

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

function hasBinary(name) {
  const cmd = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(cmd, [name], { stdio: "ignore" });
  return result.status === 0;
}

function detectTool() {
  if (requestedTool && requestedTool !== true) {
    if (!hasBinary(requestedTool)) {
      console.error(c.red(`✖ ${requestedTool} is not installed or not on PATH.`));
      process.exit(1);
    }
    return requestedTool;
  }
  if (hasBinary("cloudflared")) return "cloudflared";
  if (hasBinary("ngrok")) return "ngrok";
  return null;
}

function spawnTunnel(tool, targetPort) {
  const command =
    tool === "ngrok"
      ? { bin: "ngrok", args: ["http", String(targetPort), "--log", "stdout", "--log-format", "json"] }
      : { bin: "cloudflared", args: ["tunnel", "--url", `http://localhost:${targetPort}`, "--no-autoupdate"] };

  const child = spawn(command.bin, command.args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  return child;
}

const URL_RE = /https:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?::\d+)?(?:\/[\w./-]*)?/gi;
const IGNORED = /(localhost|127\.0\.0\.1|telegram\.org|cloudflare\.com\/signup|ngrok\.com|sentry|schema)/i;

function extractUrl(text) {
  const matches = String(text).match(URL_RE) || [];
  for (const raw of matches) {
    const url = raw.replace(/[.,)"']+$/, "");
    if (!IGNORED.test(url)) return url;
  }
  return null;
}

async function botInfo(token) {
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    return data.ok ? data.result : null;
  } catch {
    return null;
  }
}

function persistEnv(values) {
  const file = path.join(ROOT, ".env");
  let body = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  body = body.replace(/\r\n/g, "\n");
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    body = re.test(body) ? body.replace(re, line) : `${body.replace(/\n*$/, "\n")}${line}\n`;
  }
  fs.writeFileSync(file, body.replace(/\n{3,}/g, "\n\n"));
  return file;
}

function banner(url, me) {
  const link = me ? `https://t.me/${me.username}` : "(open your bot in Telegram)";
  console.log("");
  console.log(c.green("  ✔ Live on Telegram"));
  console.log(c.dim("  ──────────────────────────────────────────────"));
  console.log(`  Public URL : ${c.cyan(url)}`);
  if (me) console.log(`  Bot        : @${me.username} ${c.dim(`(${me.first_name})`)}`);
  console.log(`  Webhook    : ${c.dim(`${url}/telegram/webhook/<secret>`)}`);
  console.log(c.dim("  ──────────────────────────────────────────────"));
  console.log(`  1. Open ${c.bold(link)} in Telegram`);
  console.log(`  2. Send /start, then tap ▶️ Play now (or the 🥊 menu button)`);
  console.log(c.dim("  Press Ctrl+C to stop (the tunnel closes with it)."));
  console.log("");
}

async function main() {
  let url = typeof explicitUrl === "string" ? explicitUrl.replace(/\/+$/, "") : null;
  let tunnel = null;
  let tool = null;

  if (url) {
    if (!/^https:\/\//i.test(url)) {
      console.error(c.red("✖ --url must start with https:// (Telegram requires HTTPS)."));
      process.exit(1);
    }
    console.log(c.dim(`Using existing HTTPS URL: ${url}`));
  } else {
    tool = detectTool();
    if (!tool) {
      console.error(
        c.yellow("✖ No tunnel tool found (cloudflared or ngrok).\n") +
          "  Install one, or pass your own HTTPS URL:\n\n" +
          c.bold("    winget install --id Cloudflare.cloudflared   # Windows\n") +
          (process.platform === "win32"
            ? "    choco install ngrok\n"
            : "    brew install cloudflared        # macOS\n    sudo apt install cloudflared    # Debian/Ubuntu\n") +
          c.bold("\n    npm run live -- --url https://your-domain.com\n")
      );
      process.exit(1);
    }
    console.log(c.dim(`Starting ${tool} tunnel to http://localhost:${port} …`));
    tunnel = spawnTunnel(tool, port);

    url = await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(
          new Error(
            `No HTTPS URL from ${tool} after 30s.\n` +
              `Check that "${tool === "ngrok" ? "ngrok http " + port : "cloudflared tunnel --url http://localhost:" + port}" works on its own.`
          )
        );
      }, 30_000);

      const onData = (chunk) => {
        const text = chunk.toString();
        if (!settled && process.env.KTP_VERBOSE) process.stderr.write(c.dim(text));
        const found = extractUrl(text);
        if (found && !settled) {
          settled = true;
          clearTimeout(timer);
          resolve(found);
        }
      };
      tunnel.stdout.on("data", onData);
      tunnel.stderr.on("data", onData);
      tunnel.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      tunnel.on("exit", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`${tool} exited with code ${code} before reporting a URL.`));
      });
    });
  }

  const token = config.botToken;
  const me = await botInfo(token);
  if (token && !me) {
    console.error(c.red("✖ BOT_TOKEN is invalid (getMe failed). Check .env."));
  }

  const secret =
    config.webhookSecret && config.webhookSecret !== "change-me-please"
      ? config.webhookSecret
      : crypto.randomBytes(24).toString("hex");

  const env = {
    ...process.env,
    PUBLIC_URL: url,
    WEBHOOK_SECRET: secret,
    PORT: String(port),
    HOST: config.host,
  };

  if (save) {
    const file = persistEnv({ PUBLIC_URL: url, WEBHOOK_SECRET: secret, PORT: String(port) });
    console.log(c.dim(`Saved PUBLIC_URL + WEBHOOK_SECRET to ${path.relative(process.cwd(), file) || ".env"}`));
  } else if (!process.env.WEBHOOK_SECRET) {
    console.log(c.dim("Tip: pass --save to keep this URL/secret in .env for plain `npm start`."));
  }

  if (dryRun) {
    console.log(
      JSON.stringify({ ok: true, url, tool, bot: me ? `@${me.username}` : null, secretSet: Boolean(secret), save }, null, 2)
    );
    tunnel?.kill("SIGTERM");
    return;
  }

  banner(url, me);

  const server = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
    stdio: "inherit",
    env,
    cwd: ROOT,
  });

  const shutdown = (signal) => {
    try {
      server.kill(signal);
    } catch {
      /* already gone */
    }
    try {
      tunnel?.kill(signal);
    } catch {
      /* already gone */
    }
  };
  process.on("SIGINT", () => {
    shutdown("SIGINT");
    setTimeout(() => process.exit(0), 400);
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
    setTimeout(() => process.exit(0), 400);
  });
  server.on("exit", (code) => {
    try {
      tunnel?.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(c.red(`✖ ${error.message}`));
  process.exit(1);
});
