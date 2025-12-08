import { userBot } from "../PassengerBot";
import { getSession } from "../services/sessionManager";
import { initUserSocket } from "../socket/userSocket";
import { requestRide } from "../services/rideService";
import { startLoadingAnimation } from "../services/animationService";
import { logError, deleteMessages } from "../utils/message_deletions";
import TelegramBot from "node-telegram-bot-api";
import { sendSearchingDriverPrompt } from "../ui/prompts/searchingDriverPrompt";
import { flushAllDeletionQueues, flushDeletionQueue, queueMessageForDeletion } from "../utils/message_cleanup_manager";
import { sendNoDriverPrompt } from "../ui/prompts/noDriverPrompt";


// Utility: wrap a promise with a timeout
async function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void): Promise<T | null> {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => {
            if (onTimeout) onTimeout();
            resolve(null);
        }, ms);
    });
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
}

export const handleLocation = async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    const { latitude, longitude } = msg.location!;
    const session = getSession(chatId);
    console.log(session);

    // Step 0: Update session & initialize socket (non-blocking)
    session.location = { lat: latitude, lon: longitude };

    // Step 1: Run deletion & searching prompt concurrently
    const sent = await sendSearchingDriverPrompt(chatId)

    // Step 2: Queue deletions immediately
    queueMessageForDeletion(chatId, msg.message_id);
    queueMessageForDeletion(chatId, sent.message_id);

    // Step 3: Start animation (non-blocking)
    const stopAnimation = startLoadingAnimation(userBot, chatId, sent.message_id);
    session.searchingMessage = { messageId: sent.message_id, stopAnimation };
    schedulePhoneNumberRequest(chatId);

    // Step 4: Request ride with timeout (concurrent with animation)
    const ride = await requestRide(chatId, { lat: latitude, lon: longitude });

    // if (!ride) {
    //     stopAnimation();
    //     await safeSendMessage(chatId, "❌ Buyurtma berishda xatolik yuz berdi (timeout)");
    //     return;
    // }

    session.rideId = ride.rideId;

    // Step 5: Handle no drivers concurrently
    // if (ride.drivers === 0) {
    //     stopAnimation();

    //     const [flushRes, noDriverRes] = await Promise.allSettled([
    //         flushDeletionQueue(chatId),
    //         safeSendPrompt(chatId, sendNoDriverPrompt)
    //     ]);

    //     if (flushRes.status === 'rejected') console.error("Failed to flush deletion queue:", flushRes.reason);
    //     if (noDriverRes.status === 'fulfilled' && noDriverRes.value?.message_id) {
    //         queueMessageForDeletion(chatId, noDriverRes.value.message_id);
    //     }
    // }
};

// ------------------ Helpers ------------------
export function schedulePhoneNumberRequest(chatId: number) {
    const DELAY = 5_000; // 30 seconds

    setTimeout(async () => {
        const session = getSession(chatId);

        // Do not ask if:
        if (session.searchFinished) return;     // ride already resolved
        if (session.phone) return;              // user already shared phone number

        try {
            const sent = await userBot.sendMessage(
                chatId,
                "☎️ Haydovchi siz bilan bog‘lanishi uchun telefon raqamingizni ulashing.",
                {
                    reply_markup: {
                        keyboard: [
                            [{ text: "☎️ Telefon raqamni ulashish", request_contact: true }]
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    }
                }
            );
            session.currentMsgId = sent.message_id;
            queueMessageForDeletion(chatId, sent.message_id);
        } catch (err) {
            console.error("Failed to send phone request:", err);
        }

    }, DELAY);
}
