import { userBot } from "../../PassengerBot";
import { locationRequestKeyboard } from "../keyboards/locationKeyboard";
import { no_driver_message } from "../messages";

export function sendNoDriverPrompt(chatId: number) {
    return userBot.sendMessage(
        chatId,
        no_driver_message,
        {
            reply_markup: locationRequestKeyboard,
        }
    );
}
