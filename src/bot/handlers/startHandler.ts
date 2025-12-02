import { Message } from "node-telegram-bot-api";
import { config } from "../config/env";
import axios from "axios";
import { sendLocationRequestPrompt } from "../ui/prompts/locationRequestPrompt";
import { deleteMessageSafely, queueMessageForDeletion } from "../utils/message_cleanup_manager";
import { initializeUserSession } from "../services/sessionManager";

export const handleStart = async (msg: Message) => {
    const chatId = msg.chat.id;

    try {
        initializeUserSession(chatId);
        queueMessageForDeletion(chatId, msg.message_id);
        // Run all operations concurrently
        const [locationResult, deleteResult, userResult] = await Promise.allSettled([
            sendLocationRequestPrompt(chatId),
            deleteMessageSafely(chatId, msg.message_id),
            axios.post(`${config.backendUrl}/user/create`, { chatId })
        ]);

        // Handle location prompt result
        if (locationResult.status === 'fulfilled' && locationResult.value?.message_id) {
            queueMessageForDeletion(chatId, locationResult.value.message_id);
        } else if (locationResult.status === 'rejected') {
            console.error("Failed to send location request prompt:", locationResult.reason);
        }

        // Handle deletion result
        if (deleteResult.status === 'rejected') {
            console.error("Failed to delete start message:", deleteResult.reason);
        }

        // Handle user creation result
        if (userResult.status === 'rejected') {
            console.error("User creation failed:", userResult.reason);
        }

    } catch (err) {
        // Should rarely happen since Promise.allSettled never rejects
        console.error("Unexpected error in handleStart:", err);
    }
};
