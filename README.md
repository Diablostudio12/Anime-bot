# 🎬 Ryvan Anime Community Bot & Video Vault System

High-performance Telegram Anime Bot powered by `@grammyjs/runner` with real-time multi-mirror scraping, speculative prefetching, and automated Telegram Video Vault delivery.

---

## ⚡ Features

- **🚀 Ultra-Fast Speculative Discovery:** Real-time extraction from multiple AnimeSalt mirrors (`.cx`, `.to`, `.at`, `.me`) with zero-copy regex parsing and sub-millisecond RAM caching.
- **📺 Dynamic Season & Episode Discovery:** Queries live mirrors to discover real seasons and episode counts instead of hardcoded numbers.
- **🔒 Protected Secret Vault Delivery:** Delivers videos directly via Telegram Bot API with `protect_content: true` to prevent forwarding and unauthorized downloads.
- **🤖 Dual-Bot Coordination:**
  - **`@RyvanAnimeBot` (Customer Bot):** Interactive menus, anime search, episode browser, streaming player integration, and membership handling.
  - **`@RyvanStorageUploaderBot` (Storage Worker):** Automated indexing and uploading to private channel storage.
- **👑 VIP Pass & Cooldown System:** 2 free trial episodes with a configurable cooldown timer (16 hours) and 6-month VIP pass with dynamic UPI QR code generator.

---

## 🛠️ Setup & Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Diablostudio12/Anime-bot.git
   cd Anime-bot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   Copy `.env.example` to `.env` and fill in your tokens:
   ```bash
   cp .env.example .env
   ```

4. **Start Both Bots:**
   ```bash
   node start-all.js
   ```

---

## 📜 Commands

- `/start` — Start bot & main interactive menu
- `/vip` / `/premium` — Upgrade to 6-Month VIP Pass with dynamic UPI QR code
- `/myplan` — Check subscription status and remaining episodes
- `/episode <Anime> | <Season> | <Episode>` — Directly request an episode
- `/abyss <URL>` — Extract streaming player links from episode URL
