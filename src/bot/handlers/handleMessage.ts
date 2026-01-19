import TelegramBot, { Message } from "node-telegram-bot-api";
import axios from "axios";
import { cancel_ride_message, phone_format_incorrect } from "../ui/messages";
import { getSession } from "../services/sessionManager";
import { deleteMessageSafely, flushDeletionQueue, queueMessageForDeletion } from "../utils/message_cleanup_manager";
import { config } from "../config/env";
import { trimUzbekCountryCode } from "../../utils/trimUzbekCountryCode";
import { initUserSocket } from "../socket/userSocket";
import { saveSession } from "../../store/passengerStoreRedis";
import { sendLocationRequestPrompt } from "../ui/prompts/locationRequestPrompt";
import { createPassenger } from "./handleContact";
import { userBot } from "../PassengerBot";
import { deleteMessageLater } from "../utils/deleteMessageLater";

export async function handleMessage(msg: Message) {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();

    if (!text) return;

    queueMessageForDeletion(chatId, msg.message_id);

    const session = getSession(chatId);

    // ❌ Cancel ride
    if (text === cancel_ride_message) {
        if (session?.rideId) {
            await axios.post(`${config.backendUrl}/user/cancel-ride`, {
                rideId: session.rideId,
            });
        }

        delete session.rideId;
        await flushDeletionQueue(chatId);

        if (session?.currentMsgId) {
            await deleteMessageSafely(chatId, session.currentMsgId);
        }
        return;
    }

    // 📞 Uzbek phone number detection
    const uzPhoneRegex = /^(?:\+998\s?)?\d{9}$/;
    // 🔢 Check if message looks like a number
    const isNumberLike = /^[+\d\s]+$/.test(text);

    if (isNumberLike && !uzPhoneRegex.test(text.replace(/\s+/g, ""))) {
        const sent = await userBot.sendMessage(chatId,
            phone_format_incorrect
        );
        deleteMessageLater(chatId, sent.message_id, 3000);
        return;
    }

    if (isNumberLike) {
        // ✅ Valid phone number
        const normalizedPhone = normalizeUzPhone(text);
        const trimmedPhone = trimUzbekCountryCode(normalizedPhone);

        session.phone = Number(trimmedPhone);

        await createPassenger(chatId, session.phone);
        initUserSocket(chatId, session.phone);
        await saveSession(chatId, session);

        await sendLocationRequestPrompt(chatId);
        await flushDeletionQueue(chatId);
    }
}



function normalizeUzPhone(phone: string): string {
    const cleaned = phone.replace(/\s+/g, "");
    if (/^\d{9}$/.test(cleaned)) return `998${cleaned}`;
    return cleaned;
}
