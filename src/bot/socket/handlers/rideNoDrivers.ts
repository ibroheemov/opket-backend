import TelegramBot from "node-telegram-bot-api";
import { getSession } from "../../services/sessionManager";
import { deleteMessageSafely, flushDeletionQueue, queueMessageForDeletion } from "../../utils/message_cleanup_manager";

export async function handleRideNoDrivers(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);

    const sent = await bot.sendMessage(
        chatId,
        "❌ Haydovchi topilmadi, yana urinib ko'ring"
    );
    delete session.rideId;
    // if (session?.currentMsgId) await deleteMessageSafely(chatId, session?.currentMsgId)
    await flushDeletionQueue(chatId);
    // queueMessageForDeletion(chatId, sent.message_id);
}
