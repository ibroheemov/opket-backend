import TelegramBot from "node-telegram-bot-api";
import { getSession } from "../../services/sessionManager";
import { deleteMessages } from "../../utils/message_deletions";

export async function handleRideNoDrivers(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);
    deleteMessages(chatId);
    session.searchingMessage?.stopAnimation();
    await bot.sendMessage(chatId, "❌ Haydovchi topilmadi, birozdan so'ng urinib ko‘ring.");
}
