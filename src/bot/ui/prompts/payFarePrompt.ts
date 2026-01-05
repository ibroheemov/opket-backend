import { userBot } from "../../PassengerBot";
import { payFareKeyboard } from "../keyboards/payFareKeyboard";

export function payFarePrompt(chatId: number, amount: number) {
    return userBot.sendMessage(
        chatId,
        `Haydovchiga ${amount} UZS o'tkazilsinmi ?`,
        {
            reply_markup: payFareKeyboard,
        }
    );
}


