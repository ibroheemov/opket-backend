import { userBot } from "../PassengerBot";
import { getSession } from "../services/sessionManager";
import { initUserSocket } from "../socket/userSocket";
import { requestRide } from "../services/rideService";
import { startLoadingAnimation } from "../services/animationService";
import { safeDeleteMessage, logError, deleteMessages, addToMessagesToDelete } from "../utils/message_deletions";
import TelegramBot from "node-telegram-bot-api";

export const handleLocation = async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    const { latitude, longitude } = msg.location!;
    const session = getSession(chatId);

    session.location = { lat: latitude, lon: longitude };
    initUserSocket(userBot, chatId);
    await deleteMessages(chatId)

    const sent = await userBot.sendMessage(chatId, "Sizga yaqin haydovchilarni qidiryapmiz ░░░░░ 🚕", {
        reply_markup: {
            inline_keyboard: [[{ text: "❌ Buyurtmani bekor qilish", callback_data: "cancel_ride" }]],
        },
    });
    addToMessagesToDelete(chatId, msg.message_id);
    addToMessagesToDelete(chatId, sent.message_id);

    const stopAnimation = startLoadingAnimation(userBot, chatId, sent.message_id);
    session.searchingMessage = { messageId: sent.message_id, stopAnimation };

    try {
        const ride = await requestRide(chatId, { lat: latitude, lon: longitude });
        session.rideId = ride.rideId;

        if (ride.drivers == 0) {
            stopAnimation();
            deleteMessages(chatId);
            const sent = await userBot.sendMessage(
                chatId,
                "❌ Haydovchi topilmadi, birozdan so'ng urinib ko‘ring.",
                {
                    reply_markup: {
                        keyboard: [[{ text: "📍 Lokatsiya yuborish", request_location: true }]],
                        resize_keyboard: true,
                    },
                }
            );
            addToMessagesToDelete(chatId, sent.message_id);
        }
        // deleteMessages()
    } catch (err) {
        logError("requestRide", err);
        await userBot.sendMessage(chatId, "❌ Buyurtma berishda xatolik yuz berdi");
    }
};
