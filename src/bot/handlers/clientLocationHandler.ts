import { getSession } from "../services/sessionManager";
import { requestRide } from "../services/rideService";
import TelegramBot from "node-telegram-bot-api";
import { deleteMessageSafely, queueMessageForDeletion } from "../utils/message_cleanup_manager";
import { contactRequestPrompt } from "../ui/prompts/contactRequestPrompt";
import { logger } from "../../utils/logger";
import { hasPassengerPhone } from "./startHandler";
import { userBot } from "../PassengerBot";
import { ride_requested_msg } from "../ui/messages";
import { sendRideRequestSuccessMsg } from "../ui/prompts/rideRequestSuccess";

export const handleLocation = async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    const session = getSession(chatId);

    const { latitude, longitude } = msg.location!;

    const hasPhone = await hasPassengerPhone(chatId);

    if (!hasPhone) {
        const sent = await contactRequestPrompt(chatId);
        if (sent?.message_id) queueMessageForDeletion(chatId, sent.message_id);
    }

    // Step 0: Update session & initialize socket (non-blocking)
    session.location = { lat: latitude, lon: longitude };

    // Step 1: Run deletion & searching prompt concurrently

    // Step 2: Queue deletions immediately
    queueMessageForDeletion(chatId, msg.message_id);
    // Step 4: Request ride with timeout (concurrent with animation)
    const ride = await requestRide(chatId, { lat: latitude, lon: longitude }, session.phone);

    session.rideId = ride.ride_id;
    console.log(session);
    const success_msg = await sendRideRequestSuccessMsg(chatId);
    queueMessageForDeletion(chatId, success_msg.message_id);
};


