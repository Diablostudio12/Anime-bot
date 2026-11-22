"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { fetch } = require("undici");

const MIRRORS = ["animesalt.cx", "animesalttv.to", "animesalt.at", "animesalt.me"];
const CACHE_FILE = path.join(__dirname, "ryvan-data", "series-cache.json");

// In-memory cache for instant 0ms responses
const seriesMemoryCache = new Map();

// Initialize disk cache
try {
  if (fs.existsSync(CACHE_FILE)) {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    for (const [k, v] of Object.entries(raw)) {
      seriesMemoryCache.set(k, v);
    }
  }
} catch (e) {
  console.warn("⚠️ Could not load series cache from disk:", e.message);
}

function saveSeriesCache() {
  try {
    const obj = {};
    for (const [k, v] of seriesMemoryCache.entries()) {
      obj[k] = v;
    }
    const temp = `${CACHE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(obj, null, 2), "utf8");
    fs.renameSync(temp, CACHE_FILE);
  } catch {}
}

/**
 * Discovers the exact seasons and episodes for an anime from AnimeSalt mirrors.
 * @param {string} query - Anime name or slug (e.g. "Solo Leveling" or "solo-leveling")
 * @returns {Promise<object>} Discovery result with seasons and episodes
 */
async function discoverAnimeSeries(query) {
  const clean = String(query || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!clean) return { found: false, slug: "" };

  // Check RAM cache first
  if (seriesMemoryCache.has(clean)) {
    return { ...seriesMemoryCache.get(clean), cached: true };
  }

  let targetSlug = clean;

  for (const host of MIRRORS) {
    try {
      let res = await fetch(`https://${host}/series/${targetSlug}/`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(3000)
      });

      // If direct slug 404s, try search query
      if (res.status === 404) {
        const searchRes = await fetch(`https://${host}/?s=${encodeURIComponent(query)}`, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
          signal: AbortSignal.timeout(3000)
        });
        if (searchRes.ok) {
          const sHtml = await searchRes.text();
          const match = sHtml.match(/\/series\/([a-z0-9-]+)\/?/i);
          if (match && match[1]) {
            targetSlug = match[1];
            res = await fetch(`https://${host}/series/${targetSlug}/`, {
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
              signal: AbortSignal.timeout(3000)
            });
          }
        }
      }

      if (!res.ok) continue;

      const html = await res.text();
      const epRegex = new RegExp(`/episode/${targetSlug}-(\\d+)x(\\d+)`, "gi");
      let m;
      const seasonMap = {};

      while ((m = epRegex.exec(html)) !== null) {
        const s = Number(m[1]);
        const ep = Number(m[2]);
        if (!seasonMap[s]) seasonMap[s] = new Set();
        seasonMap[s].add(ep);
      }

      const seasons = Object.keys(seasonMap).map(Number).sort((a, b) => a - b);
      if (seasons.length === 0) continue;

      let totalEps = 0;
      const episodesBySeason = {};
      for (const s of seasons) {
        const epList = [...seasonMap[s]].sort((a, b) => a - b);
        episodesBySeason[s] = epList;
        totalEps += epList.length;
      }

      const title = targetSlug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      const result = {
        found: true,
        slug: targetSlug,
        title,
        mirror: host,
        seasons,
        totalEpisodes: totalEps,
        episodesBySeason
      };

      // Save to memory and disk cache
      seriesMemoryCache.set(clean, result);
      seriesMemoryCache.set(targetSlug, result);
      saveSeriesCache();

      return result;
    } catch {}
  }

  return { found: false, slug: clean };
}

module.exports = {
  discoverAnimeSeries,
  seriesMemoryCache
};
