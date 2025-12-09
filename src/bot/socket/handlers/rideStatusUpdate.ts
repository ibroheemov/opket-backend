import TelegramBot from "node-telegram-bot-api";
import { RideStatusPayload } from "../types";
import { getSession } from "../../services/sessionManager";
import { queueMessageForDeletion } from "../../utils/message_cleanup_manager";

export async function handleRideStatusUpdate(
    bot: TelegramBot,
    chatId: number,
    { message }: RideStatusPayload
) {
    const sent = await bot.sendMessage(chatId, message);
    const session = getSession(chatId);
    queueMessageForDeletion(chatId, sent.message_id);
}
