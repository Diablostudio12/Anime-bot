"use strict";

const {
  canWatchEpisode,
  recordWatch,
  upgradeToVip,
  revokeVip,
  formatStatus,
  isUserVip,
  COOLDOWN_HOURS
} = require("./subscription-manager");

const {
  makeEpisodeKey,
  registerVideo,
  findVideo
} = require("./video-vault");

console.log("=== RUNNING SUBSCRIPTION & VIDEO VAULT VERIFICATION ===");

const testState = {
  subscriptions: {},
  videoVault: {}
};

const testUser = "123456789";

// Test 1: First episode watch
console.log("\n[Test 1] Free User Requesting Episode 1...");
let check = canWatchEpisode(testState, testUser);
if (!check.allowed || check.tier !== "FREE") throw new Error("User should be allowed Episode 1");
let watch = recordWatch(testState, testUser);
console.log("Watch 1 recorded:", watch);
if (watch.freeWatchCount !== 1 || watch.cooldownTriggered) throw new Error("Watch 1 state invalid");
console.log("✅ Episode 1 Allowed & Recorded: PASSED");

// Test 2: Second episode watch
console.log("\n[Test 2] Free User Requesting Episode 2...");
check = canWatchEpisode(testState, testUser);
if (!check.allowed) throw new Error("User should be allowed Episode 2");
watch = recordWatch(testState, testUser);
console.log("Watch 2 recorded:", watch);
if (watch.freeWatchCount !== 2 || !watch.cooldownTriggered || !watch.unlockAt) {
  throw new Error("Watch 2 should trigger 72h cooldown");
}
console.log("✅ Episode 2 Triggered 72-Hour Cooldown: PASSED");

// Test 3: Third episode attempt (Must be blocked by 72h cooldown)
console.log("\n[Test 3] Free User Attempting Episode 3 during Cooldown...");
check = canWatchEpisode(testState, testUser);
console.log("Access check:", check);
if (check.allowed || check.reason !== "COOLDOWN_ACTIVE" || check.remainingHours !== COOLDOWN_HOURS) {
  throw new Error("User should be blocked by 72-hour cooldown!");
}
console.log("Status Card:\n", formatStatus(testState, testUser));
console.log("✅ Episode 3 Blocked with Cooldown Notice: PASSED");

// Test 4: Upgrade User to 6-Month VIP
console.log("\n[Test 4] Upgrading User to 6-Month VIP...");
const vip = upgradeToVip(testState, testUser, 180, "UTR_PAYMENT_9999");
console.log("VIP Expiry:", vip.vipExpiry);
if (!isUserVip(testState, testUser)) throw new Error("User should be active VIP");
check = canWatchEpisode(testState, testUser);
if (!check.allowed || check.tier !== "VIP_6_MONTHS") throw new Error("VIP user must have unlimited access");
console.log("VIP Status Card:\n", formatStatus(testState, testUser));
console.log("✅ 6-Month VIP Activation & Unlimited Access: PASSED");

// Test 5: Video Vault Registration & Key Lookup
console.log("\n[Test 5] Video Vault Catalog Registration & Lookup...");
const testVideo = registerVideo(testState, {
  slug: "solo-leveling",
  season: 1,
  episode: 1,
  language: "Hindi",
  fileId: "BAACAgUAAxkBAAIC_TEST_FILE_ID_12345",
  title: "Solo Leveling S1E1 (Hindi)"
});
console.log("Registered video:", testVideo);

const found = findVideo(testState, "solo-leveling", 1, 1, "Hindi");
if (!found || found.fileId !== "BAACAgUAAxkBAAIC_TEST_FILE_ID_12345") {
  throw new Error("Failed to find video in vault by episode key");
}
console.log("✅ Video Vault Key Lookup: PASSED");

// Test 6: Revoke VIP
console.log("\n[Test 6] Revoking VIP...");
revokeVip(testState, testUser);
if (isUserVip(testState, testUser)) throw new Error("VIP should be revoked");
console.log("✅ Revoke VIP: PASSED");

console.log("\n🎉 ALL SUBSCRIPTION & VIDEO VAULT TESTS PASSED!");
