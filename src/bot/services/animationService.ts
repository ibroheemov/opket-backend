import TelegramBot from "node-telegram-bot-api";

export function startLoadingAnimation(bot: TelegramBot, chatId: number, messageId: number) {
    const carFrames = ["🚕", "🚙", "🚗", "🚘", "🚖", "🛻"];
    const progressFrames = ["░░░░░", "▓░░░░", "▓▓░░░", "▓▓▓░░", "▓▓▓▓░", "▓▓▓▓▓"];
    let i = 0;

    const interval = setInterval(() => {
        const text = `Sizga yaqin haydovchilarni qidiryapmiz ${progressFrames[i % progressFrames.length]} ${carFrames[i % carFrames.length]}`;
        bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [[{ text: "❌ Buyurtmani bekor qilish", callback_data: "cancel_ride" }]],
            },
        }).catch(() => { });
        i++;
    }, 1000);

    return () => clearInterval(interval);
}
