import { userBot } from "../../PassengerBot";
import { contactRequestKeyboard } from "../keyboards/contactKeyboard";
import { contact_request_message } from "../messages";

export function contactRequestPrompt(chatId: number) {
    return userBot.sendMessage(
        chatId,
        contact_request_message,
        {
            reply_markup: contactRequestKeyboard,
        }
    );
}
