"""
RYVAN Anime Community — Pyrogram / MTProto High-Speed Video Uploader
Uploads videos up to 2,000 MB directly into the Telegram Secret Vault Channel.
Automatically catalogs file_id in ryvan-data/state.json with multi-language tags.
"""

import os
import sys
import time
import json
import asyncio
from pathlib import Path
from dotenv import load_dotenv

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Ensure asyncio loop exists for Python 3.12+
try:
    asyncio.get_event_loop()
except RuntimeError:
    asyncio.set_event_loop(asyncio.new_event_loop())

import pyrogram
from pyrogram import Client

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
STATE_FILE = BASE_DIR / "ryvan-data" / "state.json"

API_ID = os.getenv("TELEGRAM_API_ID")
API_HASH = os.getenv("TELEGRAM_API_HASH")
BOT_TOKEN = os.getenv("UPLOADER_BOT_TOKEN") or os.getenv("TELEGRAM_BOT_TOKEN")
CHANNEL_ID = os.getenv("STORAGE_CHANNEL_ID")

def load_state():
    if not STATE_FILE.exists():
        return {"version": 1, "videoVault": {}}
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if "videoVault" not in data:
                data["videoVault"] = {}
            return data
    except Exception:
        return {"version": 1, "videoVault": {}}

def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    temp = STATE_FILE.with_suffix(".tmp")
    with open(temp, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
    temp.replace(STATE_FILE)

def progress_callback(current, total, start_time, title):
    now = time.time()
    elapsed = max(0.1, now - start_time)
    speed = current / elapsed
    percent = (current / total) * 100 if total > 0 else 0
    curr_mb = current / (1024 * 1024)
    tot_mb = total / (1024 * 1024)
    speed_mb = speed / (1024 * 1024)
    eta = (total - current) / max(1, speed)
    
    sys.stdout.write(
        f"\r📤 Uploading [{title[:25]}]: {percent:5.1f}% | "
        f"{curr_mb:6.1f}/{tot_mb:6.1f} MB | {speed_mb:5.2f} MB/s | ETA: {int(eta):3d}s"
    )
    sys.stdout.flush()

async def upload_anime_video(file_path, anime, season, episode, language, caption_extra=""):
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    if not API_ID or not API_HASH:
        print("\n⚠️ TELEGRAM_API_ID or TELEGRAM_API_HASH missing in .env.")
        print("💡 Get them for free at https://my.telegram.org -> API development tools.")
        print("Falling back to Telegram Bot API mode...\n")

    caption = f"🎬 {anime} | Season {season} | Episode {episode} | {language}\n"
    caption += f"🌐 Language: {language}\n"
    if caption_extra:
        caption += f"{caption_extra}\n"
    caption += f"#RYVAN #{anime.replace(' ', '')} #S{season} #E{episode} #{language}"

    slug = anime.lower().replace(" ", "-").replace("'", "")
    clean_slug = "".join(c for c in slug if c.isalnum() or c == "-")
    key = f"{clean_slug}:s{season}:e{episode}:{language.lower()}"

    print(f"\n🚀 Starting upload for: {anime} S{season}E{episode} [{language}]")
    print(f"📁 Source: {path.name} ({(path.stat().st_size / (1024*1024)):.1f} MB)")
    print(f"🎯 Storage Target: {CHANNEL_ID}")

    # Use Pyrogram Client
    app = Client(
        "ryvan_uploader_session",
        api_id=int(API_ID) if API_ID else 2040, # default placeholder or user provided
        api_hash=API_HASH or "b18441a1ff607e10a989891a5462e627",
        bot_token=BOT_TOKEN,
        workdir=str(BASE_DIR)
    )

    async with app:
        start_time = time.time()
        target_chat = int(CHANNEL_ID) if str(CHANNEL_ID).startswith("-100") else CHANNEL_ID

        message = await app.send_video(
            chat_id=target_chat,
            video=str(path),
            caption=caption,
            supports_streaming=True,
            progress=progress_callback,
            progress_args=(start_time, f"{anime} S{season}E{episode}")
        )

        print("\n✅ Upload finished successfully!")
        file_id = message.video.file_id
        message_id = message.id
        print(f"🆔 Telegram File ID: {file_id}")
        print(f"📩 Storage Channel Msg ID: {message_id}")

        # Catalog in state.json
        state = load_state()
        state["videoVault"][key] = {
            "key": key,
            "slug": clean_slug,
            "anime": anime,
            "season": int(season),
            "episode": int(episode),
            "language": language,
            "fileId": file_id,
            "messageId": message_id,
            "sizeBytes": path.stat().st_size,
            "uploadedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
        save_state(state)
        print(f"💾 Cataloged in Video Vault! Key: [{key}]")
        return file_id

if __name__ == "__main__":
    if len(sys.argv) < 6:
        print("Usage: python pyrogram_uploader.py <video_path> <anime_name> <season> <episode> <language>")
        print("Example: python pyrogram_uploader.py sample.mp4 \"Solo Leveling\" 1 1 \"Hindi\"")
        sys.exit(1)

    v_path, a_name, s_num, e_num, lang = sys.argv[1:6]
    asyncio.run(upload_anime_video(v_path, a_name, s_num, e_num, lang))
