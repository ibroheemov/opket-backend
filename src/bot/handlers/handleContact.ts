import { Message } from "node-telegram-bot-api";
import { config } from "../config/env";
import axios from "axios";
import { sendLocationRequestPrompt } from "../ui/prompts/locationRequestPrompt";
import { flushDeletionQueue, queueMessageForDeletion } from "../utils/message_cleanup_manager";
import { getSession } from "../services/sessionManager";
import { trimUzbekCountryCode } from "../../utils/trimUzbekCountryCode";
import { getSessionRedis, saveSession } from "../../store/passengerStoreRedis";
import { initUserSocket } from "../socket/userSocket";


export const handleContact = async (msg: Message) => {
    const chatId = msg.chat.id;
    const phone = msg.contact?.phone_number;
    const session = await getSessionRedis(chatId);

    if (!phone) return;

    try {
        queueMessageForDeletion(chatId, msg.message_id);

        session.phone = trimUzbekCountryCode(phone);

        // Initialize passenger socket
        initUserSocket(chatId, session.phone);

        await saveSession(chatId, session);
        // Optionally send location prompt
        await sendLocationRequestPrompt(chatId);

        flushDeletionQueue(chatId)
    } catch (err) {
        console.error("Failed to create/update user:", err);
    }
};
