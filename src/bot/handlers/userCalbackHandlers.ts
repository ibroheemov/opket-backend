import TelegramBot from "node-telegram-bot-api";
import { getSession } from "../services/sessionManager";
import { config } from "../config/env";
import axios from "axios";
import { deleteMessageSafely, flushDeletionQueue, queueMessageForDeletion } from "../utils/message_cleanup_manager";
import { deleteMessages } from "../utils/message_deletions";
import { sendPaymentSuccessMsg } from "../ui/prompts/sendPaymentSuccessMsg";
import { deleteMessageLater } from "../utils/deleteMessageLater";
import { getSessionRedis } from "../../store/passengerStoreRedis";

export function setupUserCallbackHandlers(bot: TelegramBot) {
    bot.on("callback_query", async (query) => {
        const chatId = query.message?.chat.id!;
        const action = query.data!;
        const session = getSession(chatId);
        const sessionRedis = await getSessionRedis(chatId);
        console.log(action, session);

        if (action.startsWith("cancel_ride")) {
            if (session?.rideId) {
                axios.post(`${config.backendUrl}/user/cancel-ride`, { rideId: session?.rideId });
            }
            await flushDeletionQueue(chatId);
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

        } else if (action.startsWith("pay_fare_yes")) {
            console.log("pay_fare_yes", session?.rideId);
            if (session?.rideId) {
                const res = await axios.post(`${config.backendUrl}/user/${sessionRedis?.phone}/pay-fare`, { driverId: session?.driverId, amount: session.deduction_amount });
                console.log(res.data);
                const sent = await sendPaymentSuccessMsg(chatId);
                deleteMessageLater(chatId, sent.message_id, 4000);
                await flushDeletionQueue(chatId);
            }
        }
    });
}
