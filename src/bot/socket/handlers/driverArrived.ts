import TelegramBot from "node-telegram-bot-api";
import { getSession } from "../../services/sessionManager";
import { deleteMessageLater } from "../../utils/deleteMessageLater";
import { driver_arrived_msg } from "../../ui/messages";
import { queueMessageForDeletion } from "../../utils/message_cleanup_manager";

export async function handleDriverArrived(bot: TelegramBot, chatId: number) {
    const session = getSession(chatId);

    const sent = await bot.sendMessage(
        chatId,
        driver_arrived_msg
    );
    queueMessageForDeletion(chatId, sent.message_id);
    // deleteMessageLater(chatId, sent.message_id, 5000);
}
