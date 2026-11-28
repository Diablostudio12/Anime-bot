"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { fetch } = require("undici");

const MIRRORS = ["animesalt.cx", "animesalttv.to", "animesalt.at", "animesalt.me"];
const ANIMECENTER_SUPABASE_URL = "https://hamddjtjxrwftckocqno.supabase.co";
const ANIMECENTER_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhbWRkanRqeHJ3ZnRja29jcW5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MjEzOTksImV4cCI6MjA5MTE5NzM5OX0.Rc7kezQo7pPvd_W66Au9h1dnqPpDSUl_SfsYuqJ4JQc";
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

function getFetchUrl(targetUrl) {
  const proxy = process.env.CF_PROXY_URL ? process.env.CF_PROXY_URL.trim().replace(/\/$/, "") : "";
  if (proxy && /^https?:\/\//i.test(proxy)) {
    return `${proxy}?url=${encodeURIComponent(targetUrl)}`;
  }
  return targetUrl;
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
      const seriesUrl = `https://${host}/series/${targetSlug}/`;
      let res = await fetch(getFetchUrl(seriesUrl), {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(4000)
      });

      // If direct slug 404s, try search query
      if (res.status === 404) {
        const searchUrl = `https://${host}/?s=${encodeURIComponent(query)}`;
        const searchRes = await fetch(getFetchUrl(searchUrl), {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
          signal: AbortSignal.timeout(4000)
        });
        if (searchRes.ok) {
          const sHtml = await searchRes.text();
          const match = sHtml.match(/\/series\/([a-z0-9-]+)\/?/i);
          if (match && match[1]) {
            targetSlug = match[1];
            res = await fetch(getFetchUrl(`https://${host}/series/${targetSlug}/`), {
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
              signal: AbortSignal.timeout(4000)
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

  // 2. Fallback: Search FloxAnimeIndia (Hindi Dubbed & Subbed Anime)
  try {
    const floxResult = await discoverFloxAnime(query);
    if (floxResult && floxResult.found) {
      seriesMemoryCache.set(clean, floxResult);
      seriesMemoryCache.set(floxResult.slug, floxResult);
      saveSeriesCache();
      return floxResult;
    }
  } catch {}

  // 3. Fallback: Search WatchAniDub (Curated Hindi Dubbed Anime)
  try {
    const wadResult = await discoverWatchAniDub(query);
    if (wadResult && wadResult.found) {
      seriesMemoryCache.set(clean, wadResult);
      seriesMemoryCache.set(wadResult.slug, wadResult);
      saveSeriesCache();
      return wadResult;
    }
  } catch {}

  // 4. Fallback: Search AnimeCenter (Supabase Cloud Database)
  try {
    const acResult = await discoverAnimeCenter(query);
    if (acResult && acResult.found) {
      seriesMemoryCache.set(clean, acResult);
      seriesMemoryCache.set(acResult.slug, acResult);
      saveSeriesCache();
      return acResult;
    }
  } catch {}

  return { found: false, slug: clean };
}

async function discoverFloxAnime(query) {
  try {
    const clean = String(query || "").replace(/-/g, " ").trim();
    const searchUrl = `https://floxanimeindia.in.net/api/search.php?q=${encodeURIComponent(clean)}`;
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return null;
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) return null;
    const target = items[0];
    const slug = target.slug;

    // Fetch anime details page to list episodes
    const detailsRes = await fetch(`https://floxanimeindia.in.net/anime.php?slug=${encodeURIComponent(slug)}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(4000)
    });
    if (!detailsRes.ok) return null;
    const html = await detailsRes.text();

    const epMatches = [...html.matchAll(/watch\.php\?anime=[^"'\s&]+&ep=(\d+)/gi)].map(m => Number(m[1]));
    const epList = [...new Set(epMatches)].sort((a, b) => a - b);
    if (epList.length === 0) return null;

    return {
      found: true,
      slug,
      title: target.title || clean,
      mirror: "floxanimeindia.in.net",
      seasons: [1],
      totalEpisodes: epList.length,
      episodesBySeason: { 1: epList }
    };
  } catch {}
  return null;
}

async function discoverWatchAniDub(query) {
  try {
    const clean = String(query || "").replace(/-/g, " ").trim();
    const searchUrl = `https://watchanidub.blogspot.com/feeds/posts/default?alt=json&q=${encodeURIComponent(clean)}&max-results=5`;
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();
    const entries = data.feed?.entry || [];
    for (const entry of entries) {
      const content = entry.content?.$t || "";
      const match = content.match(/<div class="ms-data"[^>]*>([\s\S]*?)<\/div>/i);
      if (!match) continue;
      const msData = JSON.parse(match[1]);
      const seasonsObj = msData.s || {};
      const seasons = Object.keys(seasonsObj).map(Number).sort((a, b) => a - b);
      if (seasons.length === 0) continue;
      let totalEpisodes = 0;
      const episodesBySeason = {};
      for (const s of seasons) {
        const epCount = (seasonsObj[String(s)] || []).length;
        episodesBySeason[s] = Array.from({ length: epCount }, (_, i) => i + 1);
        totalEpisodes += epCount;
      }
      return {
        found: true,
        slug: msData.id || query.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        title: entry.title?.$t || msData.id,
        mirror: "watchanidub.blogspot.com",
        seasons,
        totalEpisodes,
        episodesBySeason
      };
    }
  } catch {}
  return null;
}

async function discoverAnimeCenter(query) {
  try {
    const clean = String(query || "").replace(/-/g, " ").trim();
    const res = await fetch(`${ANIMECENTER_SUPABASE_URL}/rest/v1/series?title=ilike.*${encodeURIComponent(clean)}*&select=*&limit=1`, {
      headers: { "apikey": ANIMECENTER_ANON_KEY, "Authorization": `Bearer ${ANIMECENTER_ANON_KEY}` },
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return null;
    const items = await res.json();
    if (!items || items.length === 0) return null;
    const s = items[0];
    const slug = s.slug;

    const epRes = await fetch(`${ANIMECENTER_SUPABASE_URL}/rest/v1/episodes?series_slug=eq.${slug}&select=season_number,episode_number&order=season_number.asc,episode_number.asc`, {
      headers: { "apikey": ANIMECENTER_ANON_KEY, "Authorization": `Bearer ${ANIMECENTER_ANON_KEY}` },
      signal: AbortSignal.timeout(4000)
    });
    if (!epRes.ok) return null;
    const eps = await epRes.json();
    const seasonMap = {};
    for (const ep of eps) {
      const sNum = ep.season_number;
      const eNum = ep.episode_number;
      if (!seasonMap[sNum]) seasonMap[sNum] = new Set();
      seasonMap[sNum].add(eNum);
    }
    const seasons = Object.keys(seasonMap).map(Number).sort((a, b) => a - b);
    if (seasons.length === 0) return null;
    let totalEpisodes = 0;
    const episodesBySeason = {};
    for (const sn of seasons) {
      const epList = [...seasonMap[sn]].sort((a, b) => a - b);
      episodesBySeason[sn] = epList;
      totalEpisodes += epList.length;
    }
    return {
      found: true,
      slug,
      title: s.title,
      mirror: "animecenter.pages.dev",
      seasons,
      totalEpisodes,
      episodesBySeason
    };
  } catch {}
  return null;
}

const ANIMESALT_CATALOG_DOMAINS = [
  "animesalt.cx",
  "animesalttv.to",
  "animesalt.at",
  "animesalt.me"
];

function slugToCleanTitle(slug) {
  return String(slug || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Check karta hai ki kisi anime slug par diye gaye domain me Abyss source hai ya nahi.
 * Sirf boolean return karta hai (koi URL store ya return nahi karta).
 */
async function verifyAnimeHasAbyssOnHost(host, slug) {
  const probeUrls = [
    `https://${host}/episode/${slug}-1x1/`,
    `https://${host}/tv/${slug}-season-1/`,
    `https://${host}/tv/${slug}/`,
    `https://${host}/series/${slug}/`
  ];

  for (const targetUrl of probeUrls) {
    try {
      const res = await fetch(getFetchUrl(targetUrl), {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(4500)
      });
      if (!res.ok) continue;
      const html = await res.text();

      // Wahi exact patterns jo mirror-manager.js ke extractCx / extractTvTo / extractAt / extractMe use karte hain
      if (
        /(?:abyss-multilang\.php|player\.php)\?data=[A-Za-z0-9+/=]+/i.test(html) ||
        /\/player\/abyss\/[A-Za-z0-9_-]+/i.test(html) ||
        /triggerEpisode\s*\(/i.test(html) ||
        /abyssplayer\.com|abyss\.to|abysscdn/i.test(html)
      ) {
        return true;
      }
    } catch {}
  }
  return false;
}

/**
 * Chaaro AnimeSalt domains check karke un sabhi anime ke clean names return karta hai
 * jinka Abyss source available hai. Output me koi URL nahi hota.
 */
async function discoverAllAbyssAnimeNames() {
  const cheerio = require("cheerio");
  const animeCandidates = new Map(); // slug -> { title, hosts: Set }

  // 1. Chaaro domains se anime catalog / sitemap / listing pages scan karna
  for (const host of ANIMESALT_CATALOG_DOMAINS) {
    const listingPaths = [
      "/series/",
      "/anime/",
      "/tv/",
      "/az-list/",
      "/"
    ];

    for (const p of listingPaths) {
      for (let page = 1; page <= 15; page++) {
        const pageUrl = page === 1
          ? `https://${host}${p}`
          : `https://${host}${p}page/${page}/`;

        try {
          const res = await fetch(getFetchUrl(pageUrl), {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            signal: AbortSignal.timeout(5000)
          });
          if (!res.ok) break;

          const html = await res.text();
          const $ = cheerio.load(html);
          let foundInPage = 0;

          $("a[href]").each((_, el) => {
            const href = String($(el).attr("href") || "");
            const match = href.match(/\/(?:series|anime|tv)\/([a-z0-9-]+)\/?$/i);
            if (!match) return;

            let slug = match[1].toLowerCase().replace(/-season-\d+$/, "");
            if (!slug || slug.length < 2 || /^(page|category|genre|tag)$/.test(slug)) return;

            const rawTitle = ($(el).attr("title") || $(el).text() || "").replace(/\s+/g, " ").trim();
            const cleanTitle = (rawTitle && rawTitle.length >= 2 && rawTitle.length <= 100 && !/^watch|download|episode/i.test(rawTitle))
              ? rawTitle
              : slugToCleanTitle(slug);

            if (!animeCandidates.has(slug)) {
              animeCandidates.set(slug, { title: cleanTitle, hosts: new Set() });
            }
            animeCandidates.get(slug).hosts.add(host);
            foundInPage++;
          });

          // Agar is path par koi naya anime card nahi mila toh next page ruk jaye
          if (foundInPage === 0 || p === "/") break;
        } catch {
          break;
        }
      }
    }
  }

  // 2. Parallel verification: sirf wahi anime filter karein jinka Abyss source live hai
  const verifiedNames = new Set();
  const entries = [...animeCandidates.entries()];
  const BATCH_SIZE = 8;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async ([slug, info]) => {
        const hostsToCheck = [...info.hosts];
        for (const host of hostsToCheck) {
          const hasAbyss = await verifyAnimeHasAbyssOnHost(host, slug);
          if (hasAbyss) {
            verifiedNames.add(info.title);
            break;
          }
        }
      })
    );
  }

  // Strictly sirf anime names ki sorted array return karna (zero URLs)
  return [...verifiedNames].sort((a, b) => a.localeCompare(b));
}


module.exports = {
  discoverAnimeSeries,
  seriesMemoryCache,
  discoverWatchAniDub,
  discoverAnimeCenter,
  discoverFloxAnime,
  discoverAllAbyssAnimeNames
};
