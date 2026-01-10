import { checkOrderCooldown, getSession, registerSuccessfulOrder } from "../services/sessionManager";
import { requestRide } from "../services/rideService";
import TelegramBot from "node-telegram-bot-api";
import { deleteMessageSafely, flushDeletionQueue, queueMessageForDeletion } from "../utils/message_cleanup_manager";
import { contactRequestPrompt } from "../ui/prompts/contactRequestPrompt";
import { logger } from "../../utils/logger";
import { hasPassengerPhone } from "./startHandler";
import { userBot } from "../PassengerBot";
import { ride_requested_msg } from "../ui/messages";
import { sendRideRequestSuccessMsg } from "../ui/prompts/rideRequestSuccess";
import { getSessionRedis } from "../../store/passengerStoreRedis";
import { initUserSocket } from "../socket/userSocket";

export const handleLocation = async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    const session = getSession(chatId);
    const sessionRedis = await getSessionRedis(chatId);

    // 🔒 COOLDOWN CHECK
    const cooldownCheck = checkOrderCooldown(session);
    if (!cooldownCheck.allowed) {
        const sent = await userBot.sendMessage(chatId, cooldownCheck.message!);
        await flushDeletionQueue(chatId);
        await deleteMessageSafely(chatId, msg.message_id);
        queueMessageForDeletion(chatId, sent.message_id);
        return;
    }

    const { latitude, longitude } = msg.location!;

    const success_msg = await sendRideRequestSuccessMsg(chatId);

    if (!sessionRedis.phone) {
        const sent = await contactRequestPrompt(chatId);
        if (sent?.message_id) queueMessageForDeletion(chatId, sent.message_id);
        return;
    }

    // Initialize passenger socket
    initUserSocket(chatId, sessionRedis.phone);


    // Step 0: Update session & initialize socket (non-blocking)
    session.location = { lat: latitude, lon: longitude };

    // Step 2: Queue deletions immediately
    queueMessageForDeletion(chatId, msg.message_id);

    // Step 4: Request ride with timeout (concurrent with animation)
    const ride = await requestRide(chatId, { lat: latitude, lon: longitude }, sessionRedis.phone);

    session.rideId = ride.ride_id;

    // ✅ REGISTER ORDER AFTER SUCCESS
    registerSuccessfulOrder(session);
    queueMessageForDeletion(chatId, success_msg.message_id);
};



