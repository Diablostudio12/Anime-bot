"use strict";

const { InlineKeyboard } = require("grammy");
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
      `Payment karne ke baad, **screenshot ya 12-digit UTR ID** yahan bot me bhejein. Admin verification ke baad aapka VIP account instant active ho jayega! 🚀`;

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

  // Handle incoming payment screenshot from users
  bot.on(["message:photo", "message:document"], async (ctx, next) => {
    const userId = String(ctx.from?.id);
    const user = ctx.from;
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || "User";
    const username = user.username ? `@${user.username}` : "No username";
    const caption = ctx.message.caption || "";

    // If owner is sending a command like /link, let next middleware handle it
    if (isOwner(ctx) && caption.startsWith("/")) {
      return next();
    }

    // 1. Reply to user immediately
    await ctx.reply(
      `✅ *Payment Proof Received!*\n\n` +
      `Aapka payment screenshot aur details admin ke paas verification ke liye submit ho gaye hain.\n` +
      `Admin jaise hi approve karenge, aapka **6-Month VIP Pass (180 Days)** turant activate ho jayega! 🚀`,
      { parse_mode: "Markdown" }
    ).catch(() => {});

    // 2. Forward/Send to Owner with 1-Click Interactive Approve Buttons
    const adminText =
      `🔔 *New VIP Payment Submission!*\n\n` +
      `👤 *User:* ${name} (${username})\n` +
      `🆔 *User ID:* \`${userId}\`\n` +
      `💰 *Plan:* 6 Months VIP (₹${vipPrice})\n` +
      `📝 *User Note/UTR:* ${caption || "None"}\n` +
      `📅 *Date:* ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`;

    const keyboard = new InlineKeyboard()
      .text("✅ Approve VIP (180 Days)", `vip:appr:${userId}:180`).row()
      .text("❌ Reject Payment", `vip:rejc:${userId}`);

    try {
      if (ctx.message.photo && ctx.message.photo.length > 0) {
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        await bot.api.sendPhoto(ownerId, fileId, {
          caption: adminText,
          parse_mode: "Markdown",
          reply_markup: keyboard
        });
      } else if (ctx.message.document) {
        await bot.api.sendDocument(ownerId, ctx.message.document.file_id, {
          caption: adminText,
          parse_mode: "Markdown",
          reply_markup: keyboard
        });
      } else {
        await bot.api.sendMessage(ownerId, adminText, {
          parse_mode: "Markdown",
          reply_markup: keyboard
        });
      }
    } catch (err) {
      console.warn("Could not forward payment proof to owner:", err.message);
    }
  });

  // Handle 1-Click Approval / Rejection from Admin
  bot.callbackQuery(/^vip:(appr|rejc):/, async ctx => {
    if (!isOwner(ctx)) {
      return ctx.answerCallbackQuery({ text: "⛔ Sirf bot admin hi approve kar sakte hain.", show_alert: true });
    }

    const data = ctx.callbackQuery.data || "";
    const [, action, targetUserId, daysText] = data.split(":");
    const durationDays = Number(daysText) || 180;

    await ctx.answerCallbackQuery().catch(() => {});

    if (action === "appr") {
      const updated = upgradeToVip(state, targetUserId, durationDays, "1-CLICK-UPI-APPROVAL");
      saveState();

      const successCaption =
        `✅ *VIP APPROVED SUCCESSFULLY!*\n\n` +
        `👤 User ID: \`${targetUserId}\`\n` +
        `📅 Validity: ${durationDays} Days (Expires: ${updated.vipExpiry.slice(0, 10)})\n` +
        `⚡ VIP access is now live for this user.`;

      // Update admin message
      try {
        if (ctx.callbackQuery.message?.photo || ctx.callbackQuery.message?.document) {
          await ctx.editMessageCaption({ caption: successCaption, parse_mode: "Markdown" });
        } else {
          await ctx.editMessageText(successCaption, { parse_mode: "Markdown" });
        }
      } catch {}

      // Notify User in their Telegram DM
      try {
        await bot.api.sendMessage(
          targetUserId,
          `🎉 *Badhaai ho! Aapka RYVAN 6-Month VIP Pass activate ho gaya hai!*\n\n` +
          `📅 *Expiry Date:* ${updated.vipExpiry.slice(0, 10)} (180 Days)\n` +
          `⚡ Ab aap bina kisi 16-hour cooldown ke saare anime episodes direct HD me dekh sakte hain!\n\n` +
          `Abhi anime search karein: \`Solo Leveling S1E1\``,
          { parse_mode: "Markdown" }
        );
      } catch (e) {
        console.warn(`Could not notify user ${targetUserId} in DM:`, e.message);
      }
    } else if (action === "rejc") {
      const rejectCaption =
        `❌ *VIP PAYMENT REJECTED*\n\n` +
        `👤 User ID: \`${targetUserId}\`\n` +
        `Status: Declined by Admin.`;

      try {
        if (ctx.callbackQuery.message?.photo || ctx.callbackQuery.message?.document) {
          await ctx.editMessageCaption({ caption: rejectCaption, parse_mode: "Markdown" });
        } else {
          await ctx.editMessageText(rejectCaption, { parse_mode: "Markdown" });
        }
      } catch {}

      // Notify User in DM
      try {
        await bot.api.sendMessage(
          targetUserId,
          `❌ *Payment Verification Failed*\n\n` +
          `Aapka payment screenshot/UTR verify nahi ho saka.\n` +
          `Kripya check karein ki sahi amount (₹${vipPrice}) sahi UPI ID par transfer hua hai ya admin se contact karein.`,
          { parse_mode: "Markdown" }
        );
      } catch (e) {
        console.warn(`Could not notify user ${targetUserId} of rejection:`, e.message);
      }
    }
  });

  // Admin-only approval command fallback: /approve <userId> [days] [reference]
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
