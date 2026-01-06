import { RideStartedPayload } from "../types";
import { userBot } from "../../PassengerBot";
import { flushDeletionQueue, queueMessageForDeletion } from "../../utils/message_cleanup_manager";
import { getSession } from "../../services/sessionManager";

export async function handleRideStarted(chatId: number, { fare }: RideStartedPayload) {
    const session = getSession(chatId);

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

    session.fareMessageId = message.message_id;

    await flushDeletionQueue(chatId)
    queueMessageForDeletion(chatId, message.message_id)
}
