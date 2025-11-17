import TelegramBot from "node-telegram-bot-api";

export async function handleRideCompleted(bot: TelegramBot, chatId: number) {
    await bot.sendMessage(chatId, "✅ Safar yakunlandi!");
}
