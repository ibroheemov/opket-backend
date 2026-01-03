import { Message } from "node-telegram-bot-api";
import { config } from "../config/env";
import axios from "axios";
import { sendLocationRequestPrompt } from "../ui/prompts/locationRequestPrompt";
import { deleteMessageSafely, queueMessageForDeletion } from "../utils/message_cleanup_manager";
import { initializeUserSession } from "../services/sessionManager";
import { contactRequestPrompt } from "../ui/prompts/contactRequestPrompt";

export interface Passenger {
    chatId: number;
    phone: number;
    balance: number;
    currentRideId?: string;
    events: {
        event: string;
        data: Record<string, any>;
    }[];
}


export const handleStart = async (msg: Message) => {
    const chatId = msg.chat.id;

    try {
        const hasPhone = await hasPassengerPhone(chatId);

        if (hasPhone) {
            // User already exists with phone → nothing more to do
            const sent = await sendLocationRequestPrompt(chatId);
            if (sent?.message_id) queueMessageForDeletion(chatId, sent.message_id);
            return;
        }

        // 2️⃣ User does not have phone → ask for contact
        initializeUserSession(chatId);
        queueMessageForDeletion(chatId, msg.message_id);

        const locationResult = await contactRequestPrompt(chatId);

        if (locationResult?.message_id) {
            queueMessageForDeletion(chatId, locationResult.message_id);
        }

        // ⚠️ DO NOT call create here — wait for contact from user
        // The contact handler will call your API to create/update the user

    } catch (err) {
        console.error("Unexpected error in handleStart:", err);
    }
};


export const hasPassengerPhone = async (chatId: number): Promise<boolean> => {
    try {
        const res = await axios.get<Passenger | null>(
            `${config.backendUrl}/user/${chatId}/get-passenger`
        );

        return Boolean(res?.data?.phone);
    } catch (error) {
        console.error("Failed to check passenger phone:", error);
        return false;
    }
};