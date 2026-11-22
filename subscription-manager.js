"use strict";

const COOLDOWN_HOURS = Number(process.env.COOLDOWN_HOURS) || 16;
const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;
const FREE_EPISODE_LIMIT = 2;
const VIP_DURATION_DAYS = 180; // 6 Months

function getSubscriptionStore(state) {
  if (!state.subscriptions || typeof state.subscriptions !== "object") {
    state.subscriptions = {};
  }
  return state.subscriptions;
}

function getUserProfile(state, userId) {
  const store = getSubscriptionStore(state);
  const uid = String(userId);
  if (!store[uid]) {
    store[uid] = {
      tier: "FREE",
      freeWatchCount: 0,
      freeCooldownUntil: null,
      vipExpiry: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  return store[uid];
}

function isUserVip(state, userId) {
  const user = getUserProfile(state, userId);
  if (user.tier === "VIP_6_MONTHS" && user.vipExpiry) {
    if (new Date(user.vipExpiry).getTime() > Date.now()) {
      return true;
    }
    // Expired VIP status
    user.tier = "FREE";
  }
  return false;
}

function canWatchEpisode(state, userId) {
  if (isUserVip(state, userId)) {
    return {
      allowed: true,
      tier: "VIP_6_MONTHS",
      reason: "VIP_ACTIVE"
    };
  }

  const user = getUserProfile(state, userId);

  // Check if active cooldown exists
  if (user.freeCooldownUntil) {
    const cooldownEnd = new Date(user.freeCooldownUntil).getTime();
    const remainingMs = cooldownEnd - Date.now();
    if (remainingMs > 0) {
      const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
      return {
        allowed: false,
        tier: "FREE",
        reason: "COOLDOWN_ACTIVE",
        remainingMs,
        remainingHours,
        unlockAt: user.freeCooldownUntil
      };
    }
    // Cooldown completed: reset free quota
    user.freeWatchCount = 0;
    user.freeCooldownUntil = null;
    user.updatedAt = new Date().toISOString();
  }

  // Check free episode allowance (up to 2)
  if (user.freeWatchCount < FREE_EPISODE_LIMIT) {
    return {
      allowed: true,
      tier: "FREE",
      reason: "FREE_QUOTA",
      episodesLeft: FREE_EPISODE_LIMIT - user.freeWatchCount
    };
  }

  // Reached limit without cooldown set (safety check)
  user.freeCooldownUntil = new Date(Date.now() + COOLDOWN_MS).toISOString();
  user.updatedAt = new Date().toISOString();
  return {
    allowed: false,
    tier: "FREE",
    reason: "COOLDOWN_ACTIVE",
    remainingMs: COOLDOWN_MS,
    remainingHours: COOLDOWN_HOURS,
    unlockAt: user.freeCooldownUntil
  };
}

function recordWatch(state, userId) {
  if (isUserVip(state, userId)) {
    return { tier: "VIP_6_MONTHS" };
  }

  const user = getUserProfile(state, userId);
  user.freeWatchCount = (user.freeWatchCount || 0) + 1;
  user.updatedAt = new Date().toISOString();

  // If user just consumed their 2nd free episode, start cooldown timer
  if (user.freeWatchCount >= FREE_EPISODE_LIMIT) {
    user.freeCooldownUntil = new Date(Date.now() + COOLDOWN_MS).toISOString();
  }

  return {
    tier: "FREE",
    freeWatchCount: user.freeWatchCount,
    cooldownTriggered: user.freeWatchCount >= FREE_EPISODE_LIMIT,
    unlockAt: user.freeCooldownUntil
  };
}

function upgradeToVip(state, userId, durationDays = VIP_DURATION_DAYS, paymentRef = "") {
  const user = getUserProfile(state, userId);
  const expiryDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  user.tier = "VIP_6_MONTHS";
  user.vipExpiry = expiryDate.toISOString();
  user.paymentReference = paymentRef;
  user.freeWatchCount = 0;
  user.freeCooldownUntil = null;
  user.updatedAt = new Date().toISOString();
  return user;
}

function revokeVip(state, userId) {
  const user = getUserProfile(state, userId);
  user.tier = "FREE";
  user.vipExpiry = null;
  user.updatedAt = new Date().toISOString();
  return user;
}

function formatStatus(state, userId) {
  const user = getUserProfile(state, userId);
  if (isUserVip(state, userId)) {
    const daysLeft = Math.ceil((new Date(user.vipExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return (
      `👑 *RYVAN VIP Member (6 Months)*\n\n` +
      `✅ Status: Active\n` +
      `📅 Expiry Date: ${user.vipExpiry.slice(0, 10)}\n` +
      `⏳ Days Remaining: ${daysLeft} days\n` +
      `⚡ Perks: Unlimited Anime Streaming, Direct Video DM, No ${COOLDOWN_HOURS}h Cooldown.`
    );
  }

  const canWatch = canWatchEpisode(state, userId);
  if (canWatch.allowed) {
    return (
      `👤 *RYVAN Free Tier Member*\n\n` +
      `🎬 Free Episodes Available: ${canWatch.episodesLeft || (FREE_EPISODE_LIMIT - user.freeWatchCount)}/2\n` +
      `⏱️ Cooldown Status: Not active\n\n` +
      `💡 *Note:* 2 free episodes use karne ke baad ${COOLDOWN_HOURS}-hour cooldown start hoga. Unlimited access ke liye /vip karein.`
    );
  }

  return (
    `⏳ *RYVAN Free Cooldown Active*\n\n` +
    `🚫 Free Quota: 2/2 episodes watched\n` +
    `⏰ Next Free Unlock in: ~${canWatch.remainingHours} hours (${canWatch.unlockAt.slice(0, 16).replace("T", " ")})\n\n` +
    `👑 *Bina wait kiye abhi dekhna hai?*\n` +
    `Use /vip to unlock 6-Month Unlimited Pass!`
  );
}

module.exports = {
  COOLDOWN_HOURS,
  FREE_EPISODE_LIMIT,
  VIP_DURATION_DAYS,
  getUserProfile,
  isUserVip,
  canWatchEpisode,
  recordWatch,
  upgradeToVip,
  revokeVip,
  formatStatus
};
