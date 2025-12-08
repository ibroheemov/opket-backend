import TelegramBot from "node-telegram-bot-api";
import { getSession } from "../../services/sessionManager";
import { addToMessagesToDelete, deleteMessages } from "../../utils/message_deletions";
import { flushDeletionQueue, queueMessageForDeletion } from "../../utils/message_cleanup_manager";

export async function handleRideNoDrivers(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);
    session.searchingMessage?.stopAnimation();
    const sent = await bot.sendMessage(
        chatId,
        "❌ Haydovchi topilmadi, yana urinib ko'ring",
        {
            reply_markup: {
                keyboard: [[{ text: "🚖 Taksi chaqirish", request_location: true }]],
                resize_keyboard: true,
            },
        }
    );
    await flushDeletionQueue(chatId);
    queueMessageForDeletion(chatId, sent.message_id);
}
