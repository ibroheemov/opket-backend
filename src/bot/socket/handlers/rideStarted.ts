import { getSession } from "../../services/sessionManager";
import { addToMessagesToDelete, safeDeleteMessage } from "../../utils/message_deletions";
import { RideStartedPayload } from "../types";
import { userBot } from "../../PassengerBot";

export async function handleRideStarted(chatId: number, { fare }: RideStartedPayload) {
    const message = await userBot.sendMessage(
        chatId,
        "🏁 Safaringiz boshlandi, Oq yo'l!\n\n Bosilgan masofa va Yo'l haqqini kuzatib boring👇",
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "📍 0.00 KM", callback_data: "no_action" },
                        { text: `💵 ${fare} UZS`, callback_data: "no_action" },
                    ],
                ],
            },
        }
    );

    const session = getSession(chatId);
    session.fareMessageId = message.message_id;

    for (const msgId of session.messagesToDelete || []) {
        await safeDeleteMessage(chatId, msgId);
    }
    addToMessagesToDelete(chatId, message.message_id);
}
