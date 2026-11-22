"use strict";

require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { Bot, InputFile } = require("grammy");
const { run } = require("@grammyjs/runner");
const { autoRetry } = require("@grammyjs/auto-retry");
const { registerVideo, makeEpisodeKey } = require("./video-vault");

const uploaderToken = process.env.UPLOADER_BOT_TOKEN;
const ownerId = process.env.TELEGRAM_OWNER_ID;

if (!uploaderToken) {
  console.error("❌ UPLOADER_BOT_TOKEN is missing in .env!");
  process.exit(1);
}

const bot = new Bot(uploaderToken);
bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 10 }));

const DATA_DIR = path.join(__dirname, "ryvan-data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return { version: 1, videoVault: {}, subscriptions: {}, jobs: [], notes: [], conversation: [], missions: [], agentUsage: {} };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (!raw.videoVault) raw.videoVault = {};
    return raw;
  } catch {
    return { version: 1, videoVault: {}, subscriptions: {}, jobs: [], notes: [], conversation: [], missions: [], agentUsage: {} };
  }
}

function saveState(state) {
  const temp = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), "utf8");
  try { fs.renameSync(temp, STATE_FILE); }
  catch (e) { try { fs.unlinkSync(temp); } catch {} throw e; }
}

let storageChannelId = process.env.STORAGE_CHANNEL_ID || "";

// Auto-detect storage channel ID from channel posts or member updates
bot.on(["channel_post", "edited_channel_post", "my_chat_member"], async (ctx, next) => {
  const chat = ctx.chat;
  if (chat && (chat.type === "channel" || chat.type === "supergroup")) {
    if (!storageChannelId || storageChannelId !== String(chat.id)) {
      storageChannelId = String(chat.id);
      console.log(`🎯 Storage Channel ID DETECTED: ${storageChannelId} (${chat.title || "Private Vault"})`);
      
      // Update .env file automatically
      try {
        const envPath = path.join(__dirname, ".env");
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, "utf8");
          if (/STORAGE_CHANNEL_ID=.*/.test(envContent)) {
            envContent = envContent.replace(/STORAGE_CHANNEL_ID=.*/, `STORAGE_CHANNEL_ID=${storageChannelId}`);
          } else {
            envContent += `\nSTORAGE_CHANNEL_ID=${storageChannelId}`;
          }
          fs.writeFileSync(envPath, envContent, "utf8");
          console.log("💾 Saved STORAGE_CHANNEL_ID to .env!");
        }
      } catch (err) {
        console.warn("Could not auto-write .env:", err.message);
      }
    }
  }
  await next();
});

// Listener for videos posted directly into the channel
bot.on("channel_post:video", async (ctx) => {
  const video = ctx.channelPost.video;
  const caption = ctx.channelPost.caption || "";
  const messageId = ctx.channelPost.message_id;

  console.log(`\n📹 New video in Storage Channel (Msg #${messageId}):`);
  console.log(`File ID: ${video.file_id}`);
  console.log(`Resolution: ${video.width}x${video.height}, Duration: ${video.duration}s, Size: ${(video.file_size / (1024 * 1024)).toFixed(1)} MB`);

  // If caption is formatted as: Anime Name | S1 | E1 | Hindi
  const parts = caption.split("|").map(s => s.trim());
  if (parts.length >= 4) {
    const [anime, seasonText, episodeText, language] = parts;
    const season = Number(seasonText.replace(/\D/g, ""));
    const episode = Number(episodeText.replace(/\D/g, ""));
    const slug = anime.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const state = loadState();
    const record = registerVideo(state, {
      slug,
      season,
      episode,
      language,
      fileId: video.file_id,
      messageId,
      title: `${anime} S${season}E${episode} (${language})`
    });
    saveState(state);
    console.log(`✅ Auto-cataloged in Video Vault: [${record.key}]`);
  }
});

// Command: /start
bot.command("start", async (ctx) => {
  if (String(ctx.from?.id) !== String(ownerId)) {
    return ctx.reply("🤖 RYVAN Storage Uploader Bot. Internal worker only.");
  }
  await ctx.reply(
    `🤖 *RYVAN Storage Uploader Bot Online*\n\n` +
    `📁 Storage Channel ID: \`${storageChannelId || "Not detected yet (send a message in channel)"}\`\n\n` +
    `Commands:\n` +
    `• \`/status\` — Check uploader & storage status\n` +
    `• \`/link <anime> | <season> | <ep> | <lang> | <file_id>\` — Manually catalog video\n` +
    `• Send/Forward any video file to this bot to get its Telegram file_id`,
    { parse_mode: "Markdown" }
  );
});

// Command: /status
bot.command("status", async (ctx) => {
  const state = loadState();
  const vaultCount = Object.keys(state.videoVault || {}).length;
  await ctx.reply(
    `📊 *Uploader Status*\n\n` +
    `Vault Channel: \`${storageChannelId || "Waiting for post in channel"}\`\n` +
    `Cataloged Videos: *${vaultCount} episodes*\n` +
    `Bot Uptime: ${Math.floor(process.uptime())}s`,
    { parse_mode: "Markdown" }
  );
});

// Command: /link
bot.command("link", async (ctx) => {
  if (String(ctx.from?.id) !== String(ownerId)) return;
  const input = (ctx.match || "").trim();
  const parts = input.split("|").map(s => s.trim());
  if (parts.length < 5) {
    return ctx.reply("Usage: /link Anime | Season | Episode | Language | fileId [Title]");
  }
  const [anime, season, episode, language, fileId, title = ""] = parts;
  const slug = anime.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const state = loadState();
  const record = registerVideo(state, {
    slug,
    season: Number(season),
    episode: Number(episode),
    language,
    fileId,
    title: title || `${anime} S${season}E${episode}`
  });
  saveState(state);
  await ctx.reply(`✅ Video registered in Vault: \`${record.key}\``, { parse_mode: "Markdown" });
});

// Direct video message to bot (owner can DM a video to bot to upload it to channel)
bot.on("message:video", async (ctx) => {
  if (String(ctx.from?.id) !== String(ownerId)) return;
  const video = ctx.message.video;
  await ctx.reply(
    `📹 *Video Received!*\n\n` +
    `🆔 File ID:\n\`${video.file_id}\`\n\n` +
    `Size: ${(video.file_size / (1024 * 1024)).toFixed(1)} MB | Duration: ${video.duration}s\n\n` +
    `To link it to an anime episode, use:\n` +
    `\`/link Anime Name | 1 | 1 | Hindi | ${video.file_id}\``,
    { parse_mode: "Markdown" }
  );
});

bot.catch(err => console.error("Uploader Bot Error:", err.message || err));

async function startUploader() {
  console.log("🚀 Initializing RYVAN Storage Uploader Bot...");
  const existing = await bot.api.getWebhookInfo().catch(() => ({ url: "" }));
  if (existing.url) {
    console.log("Clearing old webhook for Uploader Bot...");
    await bot.api.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
  }
  const info = await bot.api.getMe();
  console.log(`✅ Uploader Bot active as @${info.username} (ID: ${info.id})`);
  console.log(`Storage Channel configured: ${storageChannelId || "Not set yet"}`);

  run(bot, {
    runner: {
      fetch: {
        allowed_updates: ["message", "channel_post", "edited_channel_post", "my_chat_member"]
      }
    }
  });
}

startUploader().catch(err => {
  console.error("Uploader Bot fatal startup error:", err);
  process.exit(1);
});
