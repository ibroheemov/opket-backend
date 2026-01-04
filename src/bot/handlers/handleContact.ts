import { Message } from "node-telegram-bot-api";
import { config } from "../config/env";
import axios from "axios";
import { sendLocationRequestPrompt } from "../ui/prompts/locationRequestPrompt";
import { queueMessageForDeletion } from "../utils/message_cleanup_manager";


export const handleContact = async (msg: Message) => {
    const chatId = msg.chat.id;
    const phone = msg.contact?.phone_number;

    if (!phone) return;

    try {
        // Call backend to create or update user
        const res = await axios.post(`${config.backendUrl}/user/create-bot`, { chatId, phone });
        console.log("User created/updated:", res.data);

        // Optionally send location prompt
        const sent = await sendLocationRequestPrompt(chatId);
        if (sent?.message_id) queueMessageForDeletion(chatId, sent.message_id);
    } catch (err) {
        console.error("Failed to create/update user:", err);
    }
};
