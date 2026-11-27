"use strict";

require("dotenv").config();
const { spawn } = require("node:child_process");
const path = require("node:path");

console.log("=================================================");
console.log("🚀 RYVAN ANIME SYSTEM — STARTING MULTI-BOT RUNNER...");
console.log("=================================================");

function startWorker(name, scriptName, args = [], colorCode = "\x1b[36m") {
  const scriptPath = path.join(__dirname, scriptName);
  const RESET = "\x1b[0m";

  function spawnChild() {
    console.log(`${colorCode}[${name}] Spawning: node ${scriptName} ${args.length > 0 ? "(token masked)" : ""}${RESET}`);
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: __dirname,
      env: Object.assign({}, process.env, name === "CustomerBot-1" ? { ANIME_BOT_BULK_PORT: "8091" } : {}),
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (data) => {
      const lines = data.toString("utf8").split("\n");
      for (const line of lines) {
        if (line.trim()) {
          console.log(`${colorCode}[${name}]${RESET} ${line}`);
        }
      }
    });

    child.stderr.on("data", (data) => {
      const lines = data.toString("utf8").split("\n");
      for (const line of lines) {
        if (line.trim()) {
          console.error(`\x1b[31m[${name} ERROR]\x1b[0m ${line}`);
        }
      }
    });

    child.on("exit", (code, signal) => {
      console.warn(`\x1b[33m[${name}] Exited with code ${code} / signal ${signal}. Restarting in 3s...${RESET}`);
      setTimeout(spawnChild, 3000);
    });

    return child;
  }

  return spawnChild();
}

// 1. Gather all customer bot tokens
const primaryToken = process.env.TELEGRAM_BOT_TOKEN;
const pdiToken = process.env.PDI_BOT_TOKEN;
const extraTokens = (process.env.EXTRA_BOT_TOKENS || "")
  .split(",")
  .map(t => t.trim())
  .filter(Boolean);

const allCustomerTokens = [...new Set([primaryToken, pdiToken, ...extraTokens].filter(Boolean))];
const activeWorkers = [];

// 2. Launch customer bots
const colors = ["\x1b[32m", "\x1b[35m", "\x1b[36m", "\x1b[33m"];
allCustomerTokens.forEach((token, index) => {
  const botNum = index + 1;
  const name = `CustomerBot-${botNum}`;
  const color = colors[index % colors.length];
  activeWorkers.push(startWorker(name, "bot.js", [token], color));
});

// 3. Storage Uploader Bot (@RyvanStorageUploaderBot)
const uploaderWorker = startWorker("UploaderBot", "uploader.js", [], "\x1b[34m");
activeWorkers.push(uploaderWorker);

console.log(`✅ Started ${allCustomerTokens.length} Customer Bots + 1 Storage Uploader Bot`);

// 4. Render 24/7 Web Service Health Listener + Telegram In-App Iframe Player
const http = require("node:http");
const PORT = Number(process.env.PORT) || 8080;
const healthServer = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  // Authenticated Prime Hindi bulk-import bridge to the primary bot worker's private port.
  if (parsedUrl.pathname === "/admin/bulk-extract" && req.method === "POST") {
    const upstream = http.request({ hostname: "127.0.0.1", port: 8091, path: "/admin/bulk-extract", method: "POST", headers: req.headers, timeout: 160000 }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    });
    upstream.on("timeout", () => upstream.destroy(new Error("Bot worker timed out")));
    upstream.on("error", () => { if (!res.headersSent) { res.writeHead(502, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify({ error: "Primary bot worker unavailable" })); } });
    req.pipe(upstream);
    return;
  }

  // Route: /player or /watch — Embedded Iframe Video Player for Telegram WebApp
  if (parsedUrl.pathname === "/player" || parsedUrl.pathname === "/watch") {
    const src = parsedUrl.searchParams.get("src") || "";
    const title = parsedUrl.searchParams.get("title") || "Ryvan Anime Stream";

    if (!src || !/^https?:\/\//i.test(src)) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Missing or invalid video source URL.");
    }

    const safeSrc = src.replace(/"/g, "&quot;");
    const safeTitle = title.replace(/[<>"'&]/g, "");
    const isDirectMp4 = /\.mp4(?:\?|$)/i.test(src);
    const mediaElement = isDirectMp4
      ? `<video src="${safeSrc}" controls autoplay playsinline style="width:100%; height:100%; background:#000; outline:none;"></video>`
      : `<iframe
        src="${safeSrc}"
        allowfullscreen="true"
        webkitallowfullscreen="true"
        mozallowfullscreen="true"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        referrerpolicy="no-referrer">
      </iframe>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${safeTitle}</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      background: #000;
      color: #fff;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .container {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .header {
      background: #0f0f13;
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #1f1f2e;
      flex-shrink: 0;
    }
    .header-badge {
      background: #22c55e;
      color: #000;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: bold;
    }
    .player-wrapper {
      flex: 1;
      width: 100%;
      height: 100%;
      position: relative;
      background: #000;
    }
    iframe {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span>🎬 ${safeTitle}</span>
      <span class="header-badge">${isDirectMp4 ? "DIRECT HD MP4" : "HD STREAM"}</span>
    </div>
    <div class="player-wrapper">
      ${mediaElement}
    </div>
  </div>
  <script>
    try {
      if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
      }
    } catch (e) {}
  </script>
</body>
</html>`;

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" });
    return res.end(html);
  }

  // Default Route: Health Check
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify({
    status: "ok",
    system: "RYVAN Anime Multi-Bot",
    uptimeSeconds: Math.floor(process.uptime()),
    activeCustomerBots: allCustomerTokens.length,
    timestamp: new Date().toISOString()
  }));
});

healthServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.warn(`⚠️ Port ${PORT} already bound; running bots in background mode.`);
  } else {
    console.error("Health server error:", err.message);
  }
});

healthServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Web Service Health Server active on port ${PORT} (Render 24/7 ready)`);
});

function handleExit() {
  console.log("\n🛑 Stopping all RYVAN bot workers...");
  try { healthServer.close(); } catch {}
  for (const w of activeWorkers) {
    try { w.kill(); } catch {}
  }
  process.exit(0);
}

process.on("SIGINT", handleExit);
process.on("SIGTERM", handleExit);
