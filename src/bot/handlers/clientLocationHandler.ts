import { userBot } from "../PassengerBot";
import { getSession } from "../services/sessionManager";
import { requestRide } from "../services/rideService";
import { startLoadingAnimation } from "../services/animationService";
import TelegramBot from "node-telegram-bot-api";
import { sendSearchingDriverPrompt } from "../ui/prompts/searchingDriverPrompt";
import { deleteMessageSafely, queueMessageForDeletion } from "../utils/message_cleanup_manager";
import { scheduleContactRequest } from "../utils/schedule_contact_request";
import { contactRequestPrompt } from "../ui/prompts/contactRequestPrompt";

export const handleLocation = async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    const session = getSession(chatId);
    if (session.rideId) {
        deleteMessageSafely(chatId, msg.message_id);
        return;
    }
    const { latitude, longitude } = msg.location!;


    console.log(session);

    // Step 0: Update session & initialize socket (non-blocking)
    session.location = { lat: latitude, lon: longitude };

    // Step 1: Run deletion & searching prompt concurrently
    // const sent = await sendSearchingDriverPrompt(chatId)
    const sent2 = await contactRequestPrompt(chatId);

    // Step 2: Queue deletions immediately
    queueMessageForDeletion(chatId, msg.message_id);
    session.currentMsgId = sent2.message_id;
    // queueMessageForDeletion(chatId, sent2.message_id);

    // queueMessageForDeletion(chatId, sent.message_id);

    // Step 3: Start animation (non-blocking)
    // const stopAnimation = startLoadingAnimation(userBot, chatId, sent.message_id);
    // session.searchingMessage = { messageId: sent.message_id, stopAnimation };
    // scheduleContactRequest(chatId);

    // Step 4: Request ride with timeout (concurrent with animation)
    const ride = await requestRide(chatId, { lat: latitude, lon: longitude });

    session.rideId = ride.rideId;
};


