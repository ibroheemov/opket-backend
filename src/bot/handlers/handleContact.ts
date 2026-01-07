import { Message } from "node-telegram-bot-api";
import { config } from "../config/env";
import axios from "axios";
import { sendLocationRequestPrompt } from "../ui/prompts/locationRequestPrompt";
import { flushDeletionQueue, queueMessageForDeletion } from "../utils/message_cleanup_manager";
import { getSession } from "../services/sessionManager";
import { trimUzbekCountryCode } from "../../utils/trimUzbekCountryCode";


export const handleContact = async (msg: Message) => {
    const chatId = msg.chat.id;
    const phone = msg.contact?.phone_number;
    const session = getSession(chatId);

    if (!phone) return;

    try {
        queueMessageForDeletion(chatId, msg.message_id);

        // Call backend to create or update user
        const res = await axios.post(`${config.backendUrl}/user/create-bot`, { chatId, phone: trimUzbekCountryCode(phone) });

        session.phone = Number(phone);
        // Optionally send location prompt
        await sendLocationRequestPrompt(chatId);

        flushDeletionQueue(chatId)
    } catch (err) {
        console.error("Failed to create/update user:", err);
    }
};
