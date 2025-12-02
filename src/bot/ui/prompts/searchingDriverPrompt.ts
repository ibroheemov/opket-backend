import { userBot } from "../../PassengerBot";
import { cancelRideKeyboard } from "../keyboards/cancelRideKeyboard";
import { searching_driver_message } from "../messages";

export function sendSearchingDriverPrompt(chatId: number) {
    return userBot.sendMessage(
        chatId,
        searching_driver_message,
        {
            reply_markup: cancelRideKeyboard,
        }
    );
}
