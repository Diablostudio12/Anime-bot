"use strict";

function registerForceSubscribe(bot, ownerId, isUserVipFunc) {
  const channelId = process.env.PUBLIC_CHANNEL_ID || "";
  const channelUsername = (process.env.PUBLIC_CHANNEL_USERNAME || "").replace(/^@/, "");

  // If no public channel is configured, bypass check seamlessly
  if (!channelId && !channelUsername) {
    return;
  }

  const targetChannel = channelId || `@${channelUsername}`;
  const inviteUrl = channelUsername ? `https://t.me/${channelUsername}` : `https://t.me/${channelId.replace(/^-100/, "")}`;

  bot.use(async (ctx, next) => {
    // Only check private chats
    if (ctx.chat?.type !== "private") return next();

    const userId = ctx.from?.id;
    if (!userId) return next();

    // Owner and VIP members are exempt from force-subscribe check
    if (String(userId) === String(ownerId) || (isUserVipFunc && isUserVipFunc(userId))) {
      return next();
    }

    // Allow clicking the verify callback query
    if (ctx.callbackQuery?.data === "verify_channel_join") {
      return next();
    }

    try {
      const member = await bot.api.getChatMember(targetChannel, userId);
      const isSubscribed = ["creator", "administrator", "member", "restricted"].includes(member.status);
      if (isSubscribed) {
        return next();
      }
    } catch (error) {
      console.warn("Force-subscribe membership check error:", error.message);
      // Fail-open on Telegram permission/API error so bot doesn't completely block users
      return next();
    }

    const text =
      `📢 *Hamara Official Anime Channel Join Karein!*\n\n` +
      `RYVAN Bot par anime episodes dekhne ke liye pehle hamara official channel join karna zaroori hai.\n\n` +
      `Neeche diye gaye button par click karke channel join karein, aur fir *✅ Verify Joined* par tap karein 👇`;

    return ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📢 Join Anime Channel", url: inviteUrl }],
          [{ text: "✅ Verify Joined", callback_data: "verify_channel_join" }]
        ]
      }
    });
  });

  bot.callbackQuery("verify_channel_join", async ctx => {
    const userId = ctx.from?.id;
    try {
      const member = await bot.api.getChatMember(targetChannel, userId);
      const isSubscribed = ["creator", "administrator", "member", "restricted"].includes(member.status);
      if (isSubscribed) {
        await ctx.answerCallbackQuery({ text: "✅ Verification successful!" });
        return ctx.reply(
          `🎉 *Shukriya! Aapka channel join verify ho gaya hai.*\n\n` +
          `Ab aap anime episodes search kar sakte hain:\n` +
          `• \`Solo Leveling s1 e1 Hindi\`\n` +
          `• \`/episode Attack on Titan | 1 | 1\`\n` +
          `• \`/help\` for all commands!`,
          { parse_mode: "Markdown" }
        );
      }
      return ctx.answerCallbackQuery({
        text: "❌ Pehle channel join karein, fir verify karein!",
        show_alert: true
      });
    } catch (error) {
      return ctx.answerCallbackQuery({
        text: "Verification error. Please try again.",
        show_alert: true
      });
    }
  });
}

module.exports = {
  registerForceSubscribe
};
