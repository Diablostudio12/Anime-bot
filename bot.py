import os
import threading
import urllib.parse
import re
from flask import Flask
import telebot
from cloudscraper import create_scraper
from bs4 import BeautifulSoup

# Yahan apna BotFather wala sahi token daalein (quotes ke andar)
BOT_TOKEN = '9179820997:AAGflG5V5PvW7PHjlQ3rzcSQU3i4hb3Q3Fc'
BASE_URL = 'https://animesalt.cx'

bot = telebot.TeleBot(BOT_TOKEN)
scraper = create_scraper()
scraper.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
})

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
        
        episode_links = page_soup.select(".episodes-list a, .ep-item a, .les-content a, .episodes a")
        target_urls = [ep["href"] for ep in episode_links if ep.get("href")]
        
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
                        
            for ep_in_soup in ep_soup.find_all(["span", "div"]):
                if "server" in str(ep_in_soup).lower():
                    onclick = ep_in_soup.get("onclick", "")
                    if "http" in onclick:
                        match = re.search(r"https?://[^\s\"']+", onclick)
                        if match:
                            found_players.append((ep_url, match.group(0)))
                        
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
    status_msg = bot.reply_to(message, f"'{query}' ke links search kiye ja rahe hain, kripya rukein...")
    
    anime_url, players = extract_abyss_links(query)
    
    if not players:
        bot.edit_message_text(
            chat_id=message.chat.id,
            message_id=status_msg.message_id,
            text=f"'{query}' ke koi links nahi mile ya error aaya: {anime_url}"
        )
        return

    unique_links = {}
    for ep_url, p_url in players:
        if p_url not in unique_links:
            unique_links[p_url] = ep_url

    response_text = f"[{query}]({anime_url}) ke saare Player URLs:\n\n"
    for idx, (p_url, ep_url) in enumerate(unique_links.items(), 1):
        response_text += f"{idx}. [Player Link]({p_url})\n"

    bot.edit_message_text(
        chat_id=message.chat.id,
        message_id=status_msg.message_id,
        text=response_text,
        parse_mode="Markdown"
    )

if __name__ == "__main__":
    threading.Thread(target=run_web, daemon=True).start()
    bot.polling(none_stop=True)
                
