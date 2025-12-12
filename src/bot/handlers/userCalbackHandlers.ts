import TelegramBot from "node-telegram-bot-api";
import { getSession } from "../services/sessionManager";
import { config } from "../config/env";
import axios from "axios";
import { sendLocationRequestPrompt } from "../ui/prompts/locationRequestPrompt";
import { deleteMessageSafely, flushDeletionQueue, queueMessageForDeletion } from "../utils/message_cleanup_manager";
import { deleteMessages } from "../utils/message_deletions";

export function setupUserCallbackHandlers(bot: TelegramBot) {
    bot.on("callback_query", async (query) => {
        const chatId = query.message?.chat.id!;
        const action = query.data!;
        const session = getSession(chatId);

        if (action.startsWith("cancel_ride")) {
            delete session.rideId;
            if (session?.rideId) {
                await axios.post(`${config.backendUrl}/user/cancel-ride`, { rideId: session?.rideId });
            }
            const sent = await sendLocationRequestPrompt(chatId);
            await flushDeletionQueue(chatId);
            queueMessageForDeletion(chatId, sent.message_id)
        } else if (action.startsWith("add_luggage_no")) {
            if (session?.rideId) {
                await axios.post(`${config.backendUrl}/user/decline-luggage`, { rideId: session?.rideId });
                if (session.currentMsgId) await deleteMessageSafely(chatId, session.currentMsgId);
            }
        } else if (action.startsWith("add_luggage_yes")) {
            if (session?.rideId) {
                await axios.post(`${config.backendUrl}/user/confirm-luggage`, { rideId: session?.rideId });
                if (session.currentMsgId) await deleteMessageSafely(chatId, session.currentMsgId);
            }

        }
    });
}
