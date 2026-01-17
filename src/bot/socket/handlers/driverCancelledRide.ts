import TelegramBot from "node-telegram-bot-api";
import { getSession } from "../../services/sessionManager";
import { flushDeletionQueue } from "../../utils/message_cleanup_manager";
import { deleteMessageLater } from "../../utils/deleteMessageLater";

export async function handleRideCancelledByDriver(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);

    const sent = await bot.sendMessage(
        chatId,
        "👨‍✈️🚫 Haydovchi buyurtmani bekor qildi"
    );
    await flushDeletionQueue(chatId);
    delete session.rideId;
    deleteMessageLater(chatId, sent.message_id, 5000);
}
