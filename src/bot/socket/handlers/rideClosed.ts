import TelegramBot from "node-telegram-bot-api";
import { deleteMessageSafely } from "../../utils/message_cleanup_manager";
import { getSession } from "../../services/sessionManager";

export async function handleRideClosed(
    bot: TelegramBot,
    chatId: number,
) {
    const session = getSession(chatId);
    console.log(`RIDE CLOSED MSG ID: ${session.currentMsgId}`);
    if (session.currentMsgId) await deleteMessageSafely(chatId, session.currentMsgId);
}
