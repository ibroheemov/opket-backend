import { Message } from "node-telegram-bot-api";
import { config } from "../config/env";
import axios from "axios";
import { sendLocationRequestPrompt } from "../ui/prompts/locationRequestPrompt";
import { deleteMessageSafely, queueMessageForDeletion } from "../utils/message_cleanup_manager";

export const handleStart = async (msg: Message) => {
    const chatId = msg.chat.id;

    try {
        const sent = await sendLocationRequestPrompt(chatId).catch(err => {
            console.error("Failed to send location request prompt:", err);
            return null;
        });

        if (sent?.message_id) {
            queueMessageForDeletion(chatId, sent.message_id);
        }

        await deleteMessageSafely(chatId, msg.message_id);

        await axios.post(`${config.backendUrl}/user/create`, { chatId })
            .catch(err => {
                console.error("User creation failed:", err);
            });

    } catch (err) {
        console.error("Unexpected error in handleStart:", err);
    }
};