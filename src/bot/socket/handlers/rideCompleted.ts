import TelegramBot from "node-telegram-bot-api";
import { RideCompletedPayload } from "../types";
import { flushDeletionQueue, queueMessageForDeletion } from "../../utils/message_cleanup_manager";
import { deleteMessageLater } from "../../utils/deleteMessageLater";

export async function handleRideCompleted(
    bot: TelegramBot,
    chatId: number,
    { distance, fare }: RideCompletedPayload
) {
    const sent = await bot.sendMessage(chatId, `🏁 Safar yakunlandi, bizni tanlaganingiz uchun rahmat!`,
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `📍 ${distance} KM`, callback_data: "no_action" },
                        { text: `💵 ${fare} UZS`, callback_data: "no_action" },
                    ],
                ],
            },
        }
    );

    deleteMessageLater(chatId, sent.message_id, 25000);

    await flushDeletionQueue(chatId);
}
