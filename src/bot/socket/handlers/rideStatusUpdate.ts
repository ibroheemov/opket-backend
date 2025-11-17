import TelegramBot from "node-telegram-bot-api";
import { RideStatusPayload } from "../types";
import { getSession } from "../../services/sessionManager";

export async function handleRideStatusUpdate(
    bot: TelegramBot,
    chatId: number,
    { message }: RideStatusPayload
) {
    const sent = await bot.sendMessage(chatId, message);
    const session = getSession(chatId);
    session.messagesToDelete = [...(session.messagesToDelete || []), sent.message_id];
}
