import TelegramBot from "node-telegram-bot-api";
import { RideCompletedPayload } from "../types";
import { deleteMessages } from "../../utils/message_deletions";

export async function handleRideCompleted(
    bot: TelegramBot,
    chatId: number,
    { distance, fare }: RideCompletedPayload
) {
    await bot.sendMessage(chatId, `
🏁 Safar yakunlandi, bizni tanlaganingiz uchun rahmat!\n
💵 Haydovchidan qaytimni Opket Hamyoniga tashlashini so'rang\n
    `,
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `📍 ${distance} KM`, callback_data: "no_action" },
                        { text: `💵 ${fare} UZS`, callback_data: "no_action" },
                    ],
                    // [
                    //     { text: '1⭐', callback_data: "no_action" },
                    //     { text: '2⭐', callback_data: "no_action" },
                    //     { text: '3⭐', callback_data: "no_action" },
                    //     { text: '4⭐', callback_data: "no_action" },
                    //     { text: '5⭐', callback_data: "no_action" },
                    // ],
                ],
            },
        }
    );

    deleteMessages(chatId);
}
