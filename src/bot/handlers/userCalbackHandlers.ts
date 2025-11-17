import TelegramBot from "node-telegram-bot-api";
import { addToMessagesToDelete, deleteMessages } from "../utils/message_deletions";
import { sendLocationToToRequestRide } from "./startHandler";
import { getSession } from "../services/sessionManager";
import { config } from "../config/env";
import axios from "axios";

export function setupUserCallbackHandlers(bot: TelegramBot) {
    bot.on("callback_query", async (query) => {
        const chatId = query.message?.chat.id!;
        const action = query.data!;
        const session = getSession(chatId);

        if (action.startsWith("cancel_ride")) {
            if (session?.rideId) {
                await axios.post(`${config.backendUrl}/user/cancel-ride`, { rideId: session?.rideId });
            }
            session?.searchingMessage?.stopAnimation()
            const sent = await sendLocationToToRequestRide(chatId);
            await deleteMessages(chatId);
            await addToMessagesToDelete(chatId, sent.message_id);
        }
    });
}
