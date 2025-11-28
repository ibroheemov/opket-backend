import TelegramBot from "node-telegram-bot-api";
import { RidePayChangePayload } from "../types";

export async function handleRidePayChange(bot: TelegramBot, chatId: number, { amount, passengerBalance, driverId }: RidePayChangePayload) {
    await bot.sendMessage(chatId, '✅ Hamyoningizga pul tushdi', {
        reply_markup: {
            inline_keyboard: [
                [{ text: `💵 Tushdi: ${amount} UZS`, callback_data: "no_action" }],
                [{ text: `💳 Balans: ${passengerBalance} UZS`, callback_data: "no_action" }]
            ],
        },
    });
}
