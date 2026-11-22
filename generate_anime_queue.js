"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { fetchEpisodeAbyssFromAllMirrors } = require("./mirror-manager");

const STATE_FILE = path.join(__dirname, "ryvan-data", "state.json");
const OUTPUT_FILE = path.join(__dirname, "anime_vault_queue.json");

const TARGET_ANIMES = [
  { slug: "solo-leveling", title: "Solo Leveling", seasons: [1, 2], maxEpisodes: [12, 13] },
  { slug: "attack-on-titan", title: "Attack on Titan", seasons: [1, 2, 3, 4], maxEpisodes: [25, 12, 22, 30] },
  { slug: "chainsaw-man", title: "Chainsaw Man", seasons: [1], maxEpisodes: [12] },
  { slug: "blue-lock", title: "Blue Lock", seasons: [1, 2], maxEpisodes: [24, 14] },
  { slug: "assassination-classroom", title: "Assassination Classroom", seasons: [1, 2], maxEpisodes: [22, 25] },
  { slug: "baki", title: "Baki", seasons: [1, 2], maxEpisodes: [26, 13] },
  { slug: "baki-hanma", title: "Baki Hanma", seasons: [1, 2], maxEpisodes: [12, 27] },
  { slug: "black-clover", title: "Black Clover", seasons: [1], maxEpisodes: [30] }
];

async function extractEpisodeLinks(slug, season, episode) {
  const result = await fetchEpisodeAbyssFromAllMirrors(slug, season, episode);
  if (result.success && result.links.length > 0) {
    return result.links;
  }
  return null;
}

async function generateQueue(limitPerAnime = null) {
  console.log("🚀 Scanning searched anime to extract multi-language links...");
  const queue = [];

  for (const item of TARGET_ANIMES) {
    console.log(`\n📺 Anime: ${item.title}`);
    for (let sIdx = 0; sIdx < item.seasons.length; sIdx++) {
      const season = item.seasons[sIdx];
      const maxEp = limitPerAnime || item.maxEpisodes[sIdx] || 12;
      console.log(`  📂 Season ${season} (Checking ${maxEp} episodes)...`);

      for (let ep = 1; ep <= maxEp; ep++) {
        try {
          const links = await extractEpisodeLinks(item.slug, season, ep);
          if (links && links.length > 0) {
            console.log(`    ✅ S${season}E${ep}: Found ${links.length} languages (${links.map(l => l.language).join(", ")})`);
            queue.push({
              anime: item.title,
              slug: item.slug,
              season,
              episode: ep,
              episodeUrl: `https://animesalt.cx/episode/${item.slug}-${season}x${ep}/`,
              languages: links
            });
          } else {
            console.log(`    ⚠️ S${season}E${ep}: Not found / no player links`);
          }
        } catch (err) {
          console.error(`    ❌ S${season}E${ep} error:`, err.message);
        }
        await new Promise(r => setTimeout(r, 600));
      }
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(queue, null, 2), "utf8");
  console.log(`\n🎉 Generated queue file: ${OUTPUT_FILE}`);
  console.log(`📊 Total episodes cataloged: ${queue.length}`);
  return queue;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const sampleLimit = args.includes("--sample") ? 2 : null;
  generateQueue(sampleLimit).catch(console.error);
}

module.exports = { generateQueue, extractEpisodeLinks };
