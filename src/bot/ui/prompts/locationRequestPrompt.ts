import { userBot } from "../../PassengerBot";
import { locationRequestKeyboard } from "../keyboards/locationKeyboard";

export function sendLocationRequestPrompt(chatId: number) {
    return userBot.sendMessage(
        chatId,
        "Taxi chaqirish uchun lokatsiyangizni yuboring👇",
        {
            reply_markup: locationRequestKeyboard,
        }
    );
}
