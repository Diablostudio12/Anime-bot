"use strict";

const { fetch } = require("undici");
const cheerio = require("cheerio");

const HOST = "animecenter.pages.dev";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36";

function episodeParts(input) {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== HOST) {
    throw new Error("AnimeCenter HTTPS episode URL required");
  }
  const match = url.pathname.match(/\/(?:episode|episodes)\/([a-z0-9-]+?)-(\d+)x(\d+)\/?$/i)
    || url.pathname.match(/\/([a-z0-9-]+?)-(\d+)x(\d+)\/?$/i);
  if (!match) throw new Error("AnimeCenter episode path not recognized");
  return { slug: match[1], season: Number(match[2]), episode: Number(match[3]), url: url.href };
}

function extractCandidateUrls(html, pageUrl) {
  const found = new Set();
  const $ = cheerio.load(html);
  $("iframe[src], iframe[data-src], source[src], a[href]").each((_, el) => {
    for (const attr of ["src", "data-src", "href"]) {
      const raw = $(el).attr(attr);
      if (!raw) continue;
      try { found.add(new URL(raw, pageUrl).href); } catch {}
    }
  });
  for (const match of html.matchAll(/https?:\\?\/\\?\/[^"'\\s<>]+/gi)) {
    const raw = match[0].replace(/\\\//g, "/").replace(/&amp;/g, "&");
    try { found.add(new URL(raw, pageUrl).href); } catch {}
  }
  return [...found];
}

function decodePlayerData(html) {
  const links = [];
  const patterns = [
    /(?:player\.php|abyss-multilang\.php)[^"'<>]*?[?&]data=([A-Za-z0-9+/=_-]+)/gi,
    /data\s*[:=]\s*["']([A-Za-z0-9+/=_-]{24,})["']/gi
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      try {
        const raw = match[1].replace(/-/g, "+").replace(/_/g, "/");
        const decoded = Buffer.from(raw, "base64").toString("utf8");
        const json = JSON.parse(decoded);
        const entries = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
        for (const item of entries) {
          const value = item?.link || item?.url || item?.src;
          if (typeof value === "string" && /abyssplayer\.com|abyss\.to|abysscdn/i.test(value)) {
            links.push({ language: item.language || item.lang || "Hindi", playerUrl: value });
          }
        }
      } catch {}
    }
  }
  return links;
}

async function extractAnimeCenter(input) {
  const parts = episodeParts(input);
  const response = await fetch(parts.url, {
    headers: { "User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml" },
    redirect: "error",
    signal: AbortSignal.timeout(12000)
  });
  if (response.status === 403) throw new Error("AnimeCenter denied the request (HTTP 403); stopped without retry.");
  if (!response.ok) throw new Error("AnimeCenter episode page HTTP " + response.status);
  const html = await response.text();

  const results = decodePlayerData(html);
  const candidateUrls = extractCandidateUrls(html, parts.url);
  for (const candidate of candidateUrls) {
    if (/abyssplayer\.com|abyss\.to|abysscdn/i.test(candidate)) {
      results.push({ language: "Hindi", playerUrl: candidate });
      continue;
    }
    let candidateUrl;
    try { candidateUrl = new URL(candidate); } catch { continue; }
    // Only inspect same-site player/iframe routes. No redirects or arbitrary hosts.
    if (candidateUrl.hostname.toLowerCase() !== HOST || !/(player|embed|watch)/i.test(candidateUrl.pathname)) continue;
    try {
      const playerResponse = await fetch(candidateUrl.href, {
        headers: { "User-Agent": USER_AGENT, "Referer": parts.url },
        redirect: "error",
        signal: AbortSignal.timeout(8000)
      });
      if (!playerResponse.ok) continue;
      const playerHtml = await playerResponse.text();
      results.push(...decodePlayerData(playerHtml));
      for (const nested of extractCandidateUrls(playerHtml, candidateUrl.href)) {
        if (/abyssplayer\.com|abyss\.to|abysscdn/i.test(nested)) {
          results.push({ language: "Hindi", playerUrl: nested });
        }
      }
    } catch {}
  }
  const unique = [...new Map(results.filter(x => /^https?:\/\//i.test(x.playerUrl))
    .map(x => [x.playerUrl, x])).values()];
  if (!unique.length) throw new Error("No supported player link pattern found on AnimeCenter page");
  return unique.map(x => ({ mirror: HOST, language: x.language || "Hindi", playerUrl: x.playerUrl, isAbyss: true }));
}

module.exports = { extractAnimeCenter, episodeParts };
