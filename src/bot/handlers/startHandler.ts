import { Message } from "node-telegram-bot-api";
import { config } from "../config/env";
import axios from "axios";
import { sendLocationRequestPrompt } from "../ui/prompts/locationRequestPrompt";
import { deleteMessageSafely, queueMessageForDeletion } from "../utils/message_cleanup_manager";
import { getSession, initializeUserSession } from "../services/sessionManager";
import { contactRequestPrompt } from "../ui/prompts/contactRequestPrompt";
import { initUserSocket } from "../socket/userSocket";

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
        // const hasPhone = await hasPassengerPhone(chatId);
        const session = getSession(chatId);

        if (session.phone) {
            // User already exists with phone → nothing more to do
            const sent = await sendLocationRequestPrompt(chatId);
            deleteMessageSafely(chatId, msg.message_id)
            return;
        }

        // 2️⃣ User does not have phone → ask for contact
        initializeUserSession(chatId);

        const locationResult = await contactRequestPrompt(chatId);
        await deleteMessageSafely(chatId, msg.message_id)

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
    const session = getSession(chatId);
    try {
        const res = await axios.get<Passenger | null>(
            `${config.backendUrl}/user/${chatId}/get-passenger`
        );

        const hasPhone = Boolean(res?.data?.phone);

        if (hasPhone) {
            session.phone = Number(res?.data?.phone);
            initUserSocket(chatId, session.phone)
        }

        return hasPhone;
    } catch (error) {
        console.error("Failed to check passenger phone:", error);
        return false;
    }
};