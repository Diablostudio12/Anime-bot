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
      env: process.env,
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
const extraTokens = (process.env.EXTRA_BOT_TOKENS || "")
  .split(",")
  .map(t => t.trim())
  .filter(Boolean);

const allCustomerTokens = [primaryToken, ...extraTokens].filter(Boolean);
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

function handleExit() {
  console.log("\n🛑 Stopping all RYVAN bot workers...");
  for (const w of activeWorkers) {
    try { w.kill(); } catch {}
  }
  process.exit(0);
}

process.on("SIGINT", handleExit);
process.on("SIGTERM", handleExit);
