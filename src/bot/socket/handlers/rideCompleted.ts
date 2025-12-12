import TelegramBot from "node-telegram-bot-api";
import { RideCompletedPayload } from "../types";
import { flushDeletionQueue, queueMessageForDeletion } from "../../utils/message_cleanup_manager";
import { sendLocationRequestPrompt } from "../../ui/prompts/locationRequestPrompt";
import { getSession } from "../../services/sessionManager";

export async function handleRideCompleted(
    bot: TelegramBot,
    chatId: number,
    { distance, fare }: RideCompletedPayload
) {
    const sent = await bot.sendMessage(chatId, `🏁 Safar yakunlandi, bizni tanlaganingiz uchun rahmat!\n💵 Haydovchidan qaytimni Opket Hamyoniga tashlashini so'rang\n`,
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `📍 ${distance} KM`, callback_data: "no_action" },
                        { text: `💵 ${fare} UZS`, callback_data: "no_action" },
                    ],
                    [
                        {
                            text: `💳 Balans dan to'lash`,
                            web_app: { url: "https://opketme.uz/" }
                        },
                    ],
                ],
            },
        }
    );

    const session = getSession(chatId);
    delete session.rideId;
    session.currentMsgId = sent.message_id;

    await flushDeletionQueue(chatId);
    const sent2 = await sendLocationRequestPrompt(chatId);
    queueMessageForDeletion(chatId, sent.message_id);
    queueMessageForDeletion(chatId, sent2.message_id);
}
