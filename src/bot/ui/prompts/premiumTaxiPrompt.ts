import { userBot } from "../../PassengerBot";
import { premiumTaxiKeyboard } from "../keyboards/permiumTaxiKeyboard";
import { premium_taxi_msg } from "../messages";

export function premiumTaxiPrompt(chatId: number) {
    return userBot.sendMessage(
        chatId,
        premium_taxi_msg,
        {
            reply_markup: premiumTaxiKeyboard,
        }
    );
}
