"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");

console.log("=================================================");
console.log("🚀 RYVAN ANIME SYSTEM — STARTING BOTH BOTS...");
console.log("=================================================");

function startWorker(name, scriptName, colorCode = "\x1b[36m") {
  const scriptPath = path.join(__dirname, scriptName);
  const RESET = "\x1b[0m";

  function spawnChild() {
    console.log(`${colorCode}[${name}] Spawning: node ${scriptName}${RESET}`);
    const child = spawn(process.execPath, [scriptPath], {
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

// 1. Customer Bot (@Prsnl_Jarvisai_bot or @RyvanAnimeBot)
const customerWorker = startWorker("CustomerBot", "bot.js", "\x1b[32m");

// 2. Storage Uploader Bot (@RyvanStorageUploaderBot)
const uploaderWorker = startWorker("UploaderBot", "uploader.js", "\x1b[34m");

process.on("SIGINT", () => {
  console.log("\n🛑 Stopping all RYVAN bot workers...");
  try { customerWorker.kill(); } catch {}
  try { uploaderWorker.kill(); } catch {}
  process.exit(0);
});
