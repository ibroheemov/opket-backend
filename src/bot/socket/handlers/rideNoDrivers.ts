import TelegramBot from "node-telegram-bot-api";
import { getSession } from "../../services/sessionManager";
import { addToMessagesToDelete, deleteMessages } from "../../utils/message_deletions";

export async function handleRideNoDrivers(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);
    deleteMessages(chatId);
    session.searchingMessage?.stopAnimation();
    const sent = await bot.sendMessage(
        chatId,
        "❌ Haydovchi topilmadi, birozdan so'ng urinib ko‘ring.",
        {
            reply_markup: {
                keyboard: [[{ text: "📍 Lokatsiya yuborish", request_location: true }]],
                resize_keyboard: true,
            },
        }
    );
    addToMessagesToDelete(chatId, sent.message_id);

}
