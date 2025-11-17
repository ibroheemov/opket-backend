import TelegramBot from "node-telegram-bot-api";
import { RideProgressPayload } from "../types";
import { getSession } from "../../services/sessionManager";

export async function handleRideProgress(
    bot: TelegramBot,
    chatId: number,
    { distance, fare }: RideProgressPayload
) {
    const session = getSession(chatId);
    if (!session?.fareMessageId) return;

    try {
        await bot.editMessageReplyMarkup(
            {
                inline_keyboard: [
                    [
                        { text: `📍 ${distance} KM`, callback_data: "no_action" },
                        { text: `💵 ${fare} UZS`, callback_data: "no_action" },
                    ],
                ],
            },
            { chat_id: chatId, message_id: session.fareMessageId }
        );
    } catch (err) {
        console.error("❌ Failed to update fare message:", err);
    }
}
