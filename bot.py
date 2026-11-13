import os
import threading
import urllib.parse
import re
from flask import Flask
import telebot
import cloudscraper
from bs4 import BeautifulSoup

BOT_TOKEN = "9179820997:AAHRG341kcM39sD64VTI1Ro8WQpDKz899r4"
BASE_URL = "https://animesalt.cx"

bot = telebot.TeleBot(BOT_TOKEN)
scraper = cloudscraper.create_scraper(
    browser={'browser': 'chrome', 'platform': 'windows', 'mobile': False}
)

app = Flask(__name__)

@app.route('/')
def home():
    return "Bot is running 24/7!"

def run_web():
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)

def extract_abyss_links(anime_query):
    try:
        encoded_query = urllib.parse.quote_plus(anime_query)
        search_url = f"{BASE_URL}/?s={encoded_query}"
        
        search_res = scraper.get(search_url, timeout=15)
        if search_res.status_code != 200:
            return None, "Website tak pahunchne mein dikkat aa rahi hai."

        soup = BeautifulSoup(search_res.text, "html.parser")
        first_result = soup.select_one("article a, .result-item a, .post-title a, h2 a, .items .item a")
        
        if not first_result or not first_result.get("href"):
            return None, "Is naam se koi anime nahi mila."

        anime_page_url = first_result["href"]
        page_res = scraper.get(anime_page_url, timeout=15)
        page_soup = BeautifulSoup(page_res.text, "html.parser")

        episode_links = page_soup.select(".episodes-list a, .ep-item a, ul.episodes li a, .les-content a, .episodios a")
        target_urls = [ep["href"] for ep in episode_links[:5] if ep.get("href")]
        
        if not target_urls:
            target_urls = [anime_page_url]

        found_players = []

        for ep_url in target_urls:
            ep_res = scraper.get(ep_url, timeout=15)
            ep_soup = BeautifulSoup(ep_res.text, "html.parser")

            for iframe in ep_soup.find_all("iframe"):
                for attr in ["src", "data-src", "data-url", "nitro-lazy-src"]:
                    val = iframe.get(attr)
                    if val:
                        found_players.append((ep_url, val))

            for elem in ep_soup.find_all(["a", "span", "div", "li"], class_=re.compile(r'server|player|option|button|play', re.I)):
                for attr in ["data-url", "data-link", "data-src", "href"]:
                    val = elem.get(attr)
                    if val and val.startswith("http"):
                        found_players.append((ep_url, val))

            regex_matches = re.findall(r'https?://(?:www\.)?[^\s"\'<>]+(?:abyss|hydrax|abysscdn|short\.ink|embed|player|vidstream|stream)[^\s"\'<>]*', ep_res.text, re.I)
            for match in regex_matches:
                found_players.append((ep_url, match))

        return anime_page_url, found_players

    except Exception as e:
        return None, f"Error: {str(e)}"

@bot.message_handler(commands=['start', 'help'])
def send_welcome(message):
    bot.reply_to(
        message,
        "Namaste! Mujhe kisi bhi Anime ka naam bhejein, main uske player URLs dhoondh kar dunga."
    )

@bot.message_handler(func=lambda message: True)
def handle_anime_search(message):
    query = message.text.strip()
    status_msg = bot.reply_to(message, f"🔍 '{query}' ke links search kiye ja rahe hain, kripya rukein...")

    anime_url, result = extract_abyss_links(query)

    if isinstance(result, str):
        bot.edit_message_text(result, chat_id=message.chat.id, message_id=status_msg.message_id)
        return

    unique_links = []
    seen = set()
    for ep, link in result:
        if link not in seen and not any(x in link.lower() for x in ['.css', '.js', 'wp-content', 'facebook', 'twitter', 'telegram', 'whatsapp']):
            seen.add(link)
            unique_links.append((ep, link))

    if not unique_links:
        bot.edit_message_text(
            f"Anime page mil gaya ({anime_url}), lekin player link extract nahi ho paaya.",
            chat_id=message.chat.id,
            message_id=status_msg.message_id
        )
        return

    response_text = f"✅ **Anime Page:** {anime_url}\n\n🎬 **Extracted Player URLs:**\n"
    for idx, (ep, player_link) in enumerate(unique_links[:10], 1):
        response_text += f"{idx}. `{player_link}`\n"

    bot.edit_message_text(
        response_text,
        chat_id=message.chat.id,
        message_id=status_msg.message_id,
        parse_mode="Markdown"
    )

if __name__ == "__main__":
    threading.Thread(target=run_web, daemon=True).start()
    print("Bot chalu ho gaya hai...")
    bot.infinity_polling(skip_pending=True)
