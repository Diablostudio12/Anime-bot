"""
RYVAN Anime Community — Vault Manager & Uploader CLI
Easily upload anime videos or sync local folders into the Telegram Storage Vault Channel.
"""

import os
import sys
import json
import asyncio
from pathlib import Path
from dotenv import load_dotenv

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

STATE_FILE = BASE_DIR / "ryvan-data" / "state.json"

def load_state():
    if not STATE_FILE.exists():
        return {"version": 1, "videoVault": {}, "subscriptions": {}}
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"version": 1, "videoVault": {}, "subscriptions": {}}

def list_vault():
    state = load_state()
    vault = state.get("videoVault", {})
    print(f"\n=======================================================")
    print(f"🎬 RYVAN VIDEO VAULT — Total Cataloged: {len(vault)}")
    print(f"=======================================================")
    if not vault:
        print("Vault is currently empty.")
        return

    for key, item in sorted(vault.items()):
        print(f"• [{item.get('language', 'Hindi')}] {item.get('anime', 'Anime')} S{item.get('season', 1)}E{item.get('episode', 1)}")
        print(f"  Key: {key} | File ID: {item.get('fileId')[:20]}... | Msg #{item.get('messageId')}")

def sync_folder(folder_path):
    """
    Scans a local directory for video files named like:
    'Solo Leveling S01E01 Hindi.mp4' or 'Attack on Titan S04E12 Hindi.mkv'
    and queues them for Pyrogram upload.
    """
    import re
    p = Path(folder_path)
    if not p.exists():
        print(f"❌ Folder not found: {folder_path}")
        return

    video_exts = {".mp4", ".mkv", ".webm", ".avi", ".mov"}
    files = [f for f in p.iterdir() if f.is_file() and f.suffix.lower() in video_exts]
    print(f"\n🔍 Found {len(files)} video files in {folder_path}")

    # Pattern: Name S01E01 Language
    pattern = re.compile(r"^(.*?)\s*s(\d+)\s*e(\d+)\s*(.*?)(?:\.[^.]+)?$", re.IGNORECASE)

    for f in files:
        m = pattern.match(f.stem)
        if m:
            anime = m.group(1).strip()
            season = int(m.group(2))
            episode = int(m.group(3))
            lang = m.group(4).strip() or "Hindi"
            print(f"  📺 Detected: {anime} | S{season} | E{episode} | {lang} -> {f.name}")
        else:
            print(f"  ℹ️ File: {f.name} (Format needed: 'Anime S01E01 Hindi.mp4')")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python vault_manager.py list")
        print("  python vault_manager.py scan <path_to_folder>")
        print("  python vault_manager.py upload <video_file> <anime> <season> <episode> <language>")
        sys.exit(0)

    cmd = sys.argv[1].lower()
    if cmd == "list":
        list_vault()
    elif cmd == "scan" and len(sys.argv) >= 3:
        sync_folder(sys.argv[2])
    elif cmd == "upload" and len(sys.argv) >= 7:
        from pyrogram_uploader import upload_anime_video
        asyncio.run(upload_anime_video(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6]))
    else:
        print("Invalid command.")
