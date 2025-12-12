import TelegramBot, { Message } from "node-telegram-bot-api";
import axios from "axios";
import { cancel_ride_message } from "../ui/messages";
import { getSession } from "../services/sessionManager";
import { sendLocationRequestPrompt } from "../ui/prompts/locationRequestPrompt";
import { deleteMessageSafely, flushDeletionQueue, queueMessageForDeletion } from "../utils/message_cleanup_manager";
import { config } from "../config/env";

export async function handleMessage(msg: Message) {
    const chatId = msg.chat.id;
    const text = msg.text;
    queueMessageForDeletion(chatId, msg.message_id)

    const session = getSession(chatId);

    if (text == cancel_ride_message) {
        if (session?.rideId) {
            await axios.post(`${config.backendUrl}/user/cancel-ride`, { rideId: session?.rideId });
        }
        delete session.rideId;
        const sent = await sendLocationRequestPrompt(chatId);
        await flushDeletionQueue(chatId);
        if (session?.currentMsgId) await deleteMessageSafely(chatId, session?.currentMsgId);
        queueMessageForDeletion(chatId, sent.message_id)
    }
}
