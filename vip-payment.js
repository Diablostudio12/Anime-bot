"use strict";

const { upgradeToVip, revokeVip, formatStatus, isUserVip } = require("./subscription-manager");

function registerVipPayment(bot, ownerId, state, saveState) {
  const isOwner = ctx => String(ctx.from?.id) === String(ownerId);
  const vipPrice = process.env.VIP_PRICE_6_MONTHS || "359";
  const cooldownHours = process.env.COOLDOWN_HOURS || "16";
  const upiVpa = process.env.UPI_PAYMENT_VPA || "cool992987@ybl";
  const upiName = process.env.UPI_PAYMENT_NAME || "RYVAN Anime VIP";

  // /vip or /premium command
  const vipHandler = async ctx => {
    const userId = ctx.from?.id;
    if (isUserVip(state, userId)) {
      return ctx.reply(formatStatus(state, userId), { parse_mode: "Markdown" });
    }

    const upiLink = `upi://pay?pa=${upiVpa}&pn=${encodeURIComponent(upiName)}&am=${vipPrice}&cu=INR&tn=${encodeURIComponent(`VIP_${userId}`)}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiLink)}`;

    const text =
      `👑 *RYVAN Anime 6-Month VIP Pass*\n\n` +
      `🔥 *VIP Benefits:*\n` +
      `• 🎬 *Unlimited Episodes:* Har anime ke saare episodes direct DM me dekhein\n` +
      `• ⚡ *No ${cooldownHours}-Hour Cooldown:* Kabhi rukna nahi padega\n` +
      `• 🔒 *Protected HD Stream:* High-speed direct Telegram video\n` +
      `• 🌐 *Multi-Audio:* Hindi, Tamil, Telugu, English & Japanese\n` +
      `• 📅 *Validity:* Full 6 Months (180 Days)\n\n` +
      `💰 *Special Price:* ₹${vipPrice} (Only ~₹60/month!)\n\n` +
      `💳 *Payment Steps via UPI:*\n` +
      `1. UPI ID: \`${upiVpa}\`\n` +
      `2. Amount: *₹${vipPrice}*\n` +
      `3. Note/Remark me apna Telegram User ID zaroor daalein: \`${userId}\`\n\n` +
      `Payment karne ke baad, screenshot aur transaction UTR ID yahan bot me bhejein ya admin ko forward karein. Verification ke turant baad aapka VIP account active ho jayega! 🚀`;

    try {
      await ctx.replyWithPhoto(qrUrl, {
        caption: text,
        parse_mode: "Markdown"
      });
    } catch {
      await ctx.reply(text, { parse_mode: "Markdown" });
    }
  };

  bot.command("vip", vipHandler);
  bot.command("premium", vipHandler);
  bot.command("buy", vipHandler);

  // /myplan command
  bot.command("myplan", async ctx => {
    return ctx.reply(formatStatus(state, ctx.from?.id), { parse_mode: "Markdown" });
  });

  // Admin-only approval: /approve <userId> [days] [reference]
  bot.command("approve", async ctx => {
    if (!isOwner(ctx)) return ctx.reply("⛔ This admin command is restricted to the bot owner.");
    const parts = (ctx.match || "").trim().split(/\s+/);
    const targetUserId = parts[0];
    const durationDays = Number(parts[1]) || 180;
    const paymentRef = parts.slice(2).join(" ") || "ADMIN_APPROVED";

    if (!targetUserId || !/^\d+$/.test(targetUserId)) {
      return ctx.reply("Usage: /approve <userId> [durationDays] [paymentRef]\nExample: /approve 8518864775 180 UTR12345678");
    }

    const updated = upgradeToVip(state, targetUserId, durationDays, paymentRef);
    saveState();

    await ctx.reply(
      `✅ *VIP Activated Successfully!*\n\n` +
      `👤 User ID: \`${targetUserId}\`\n` +
      `📅 Validity: ${durationDays} Days (Expires: ${updated.vipExpiry.slice(0, 10)})\n` +
      `📝 Reference: ${paymentRef}`,
      { parse_mode: "Markdown" }
    );

    // Notify user in DM
    try {
      await bot.api.sendMessage(
        targetUserId,
        `🎉 *Badhaai ho! Aapka RYVAN 6-Month VIP Pass activate ho gaya hai!*\n\n` +
        `📅 Expiry Date: ${updated.vipExpiry.slice(0, 10)}\n` +
        `⚡ Enjoy unlimited anime streaming without any ${cooldownHours}-hour timer!\n\n` +
        `Try searching any episode: \`Solo Leveling s1 e1 Hindi\``,
        { parse_mode: "Markdown" }
      );
    } catch (e) {
      console.warn("Could not notify user of VIP activation:", e.message);
    }
  });

  // Admin-only revoke: /revoke <userId>
  bot.command("revoke", async ctx => {
    if (!isOwner(ctx)) return ctx.reply("⛔ This admin command is restricted to the bot owner.");
    const targetUserId = (ctx.match || "").trim();
    if (!targetUserId || !/^\d+$/.test(targetUserId)) {
      return ctx.reply("Usage: /revoke <userId>");
    }

    revokeVip(state, targetUserId);
    saveState();
    return ctx.reply(`❌ VIP revoked for User ID: \`${targetUserId}\``, { parse_mode: "Markdown" });
  });

  // Admin-only subscription check: /substatus <userId>
  bot.command("substatus", async ctx => {
    if (!isOwner(ctx)) return ctx.reply("⛔ This admin command is restricted to the bot owner.");
    const targetUserId = (ctx.match || "").trim() || String(ctx.from?.id);
    return ctx.reply(formatStatus(state, targetUserId), { parse_mode: "Markdown" });
  });
}

module.exports = {
  registerVipPayment
};
