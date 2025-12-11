import { userBot } from "../../PassengerBot";
import { getSession } from "../../services/sessionManager";
import { contactRequestKeyboard } from "../keyboards/contactKeyboard";
import { contact_found_message, contact_request_message } from "../messages";

export function contactRequestPrompt(chatId: number) {
    const session = getSession(chatId);

    if (session.phone) {
        return userBot.sendMessage(
            chatId,
            `${contact_found_message} +${session.phone}`
        );
    }
    return userBot.sendMessage(
        chatId,
        session.phone ? `${contact_found_message} +${session.phone}` : contact_request_message,
        {
            reply_markup: contactRequestKeyboard,
        }
    );
}


