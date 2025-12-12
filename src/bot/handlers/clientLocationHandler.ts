import { getSession } from "../services/sessionManager";
import { requestRide } from "../services/rideService";
import TelegramBot from "node-telegram-bot-api";
import { deleteMessageSafely, queueMessageForDeletion } from "../utils/message_cleanup_manager";
import { contactRequestPrompt } from "../ui/prompts/contactRequestPrompt";

export const handleLocation = async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    const session = getSession(chatId);
    if (session.rideId) {
        deleteMessageSafely(chatId, msg.message_id);
        return;
    }
    const { latitude, longitude } = msg.location!;

    // Step 0: Update session & initialize socket (non-blocking)
    session.location = { lat: latitude, lon: longitude };

    // Step 1: Run deletion & searching prompt concurrently
    const sent2 = await contactRequestPrompt(chatId);

    // Step 2: Queue deletions immediately
    queueMessageForDeletion(chatId, msg.message_id);
    session.currentMsgId = sent2.message_id;

    // Step 4: Request ride with timeout (concurrent with animation)
    const ride = await requestRide(chatId, { lat: latitude, lon: longitude });

    session.rideId = ride.rideId;
};


