"use strict";

const { fetchEpisodeAbyssFromAllMirrors } = require("./mirror-manager");

async function benchmark() {
  console.log("--- TEST 1: Cold Request (Network Parallel Race) ---");
  const t0 = Date.now();
  const res1 = await fetchEpisodeAbyssFromAllMirrors("solo-leveling", 1, 1);
  const d1 = Date.now() - t0;
  console.log(`⏱️ Cold Run: ${res1.sourceMirror} returned in ${d1}ms | Links: ${res1.links.length}`);

  console.log("\n--- TEST 2: Warm Request (In-Memory RAM Cache) ---");
  const t1 = Date.now();
  const res2 = await fetchEpisodeAbyssFromAllMirrors("solo-leveling", 1, 1);
  const d2 = Date.now() - t1;
  console.log(`⏱️ Warm Run: ${res2.sourceMirror} returned in ${d2}ms | Links: ${res2.links.length}`);

  console.log(`\n🚀 Speedup Factor: ${(d1 / Math.max(d2, 0.1)).toFixed(0)}x FASTER!`);
}

benchmark().catch(console.error);
