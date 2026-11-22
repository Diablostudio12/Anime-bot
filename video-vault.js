"use strict";

function getVaultStore(state) {
  if (!state.videoVault || typeof state.videoVault !== "object") {
    state.videoVault = {};
  }
  return state.videoVault;
}

function makeEpisodeKey(slug, season, episode, language = "Hindi") {
  const cleanSlug = String(slug || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const langKey = String(language || "Hindi").toLowerCase();
  return `${cleanSlug}-s${season}e${episode}-${langKey}`;
}

function registerVideo(state, { slug, season, episode, language = "Hindi", fileId, messageId = null, title = "" }) {
  const store = getVaultStore(state);
  const key = makeEpisodeKey(slug, season, episode, language);
  store[key] = {
    key,
    slug,
    season: Number(season),
    episode: Number(episode),
    language,
    fileId,
    messageId,
    title,
    addedAt: new Date().toISOString()
  };
  return store[key];
}

function findVideo(state, slug, season, episode, language = "Hindi") {
  const store = getVaultStore(state);
  const key = makeEpisodeKey(slug, season, episode, language);
  if (store[key]) return store[key];

  // Fallback: look for "All" or case-insensitive match
  const searchPrefix = `${String(slug).toLowerCase()}-s${season}e${episode}-`;
  const match = Object.keys(store).find(k => k.startsWith(searchPrefix));
  return match ? store[match] : null;
}

async function deliverProtectedVideo(bot, chatId, videoRecord, caption = "") {
  if (!videoRecord || !videoRecord.fileId) {
    throw new Error("Invalid video record or missing fileId");
  }

  // Telegram natively prevents downloading to gallery and forwarding when protect_content is true
  return bot.api.sendVideo(chatId, videoRecord.fileId, {
    caption: caption || `🎬 ${videoRecord.title || "Episode"}\nSeason ${videoRecord.season} • Episode ${videoRecord.episode} (${videoRecord.language})\n\n🔒 Protected Stream • Do not share`,
    protect_content: true
  });
}

module.exports = {
  makeEpisodeKey,
  registerVideo,
  findVideo,
  deliverProtectedVideo
};
