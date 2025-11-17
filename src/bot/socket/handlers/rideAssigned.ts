import TelegramBot from "node-telegram-bot-api";
import {
    addToMessagesToDelete,
    deleteMessages,
} from "../../utils/message_deletions";
import { getDistanceFromLatLonInKm, sleep } from "../../utils/helpers";
import { RideAssignedPayload } from "../types";
import { getSession } from "../../services/sessionManager";
import { driverStore } from "../../../store/driverStore";

export async function handleRideAssigned(
    bot: TelegramBot,
    chatId: number,
    data: RideAssignedPayload
) {
    const { driver, location } = data;
    console.log("DRIVER:", driver, "LOCATION:", location);

    const session = getSession(chatId);
    if (!driver || !session || !location) return;

    // Stop animation and update text
    if (session.searchingMessage) {
        try {
            session.searchingMessage.stopAnimation();
            await bot.editMessageText("✅ Haydovchi topildi!", {
                chat_id: chatId,
                message_id: session.searchingMessage.messageId,
            });
        } catch (err) {
            console.warn("⚠️ Failed to update searching message:", err);
        }
    }

    // Send live location
    const { lat, lon } = driver.location;
    const locationMsg = await bot.sendLocation(chatId, lat, lon, { live_period: 900 });
    session.messageId = locationMsg.message_id;

    // Send driver info
    const distance = getDistanceFromLatLonInKm(
        lat,
        lon,
        session.location!.lat,
        session.location!.lon
    );

    const infoMsg = await bot.sendMessage(
        chatId,
        `Haydovchi yo'lda ☝️\n\n👨‍✈️Haydovchi: ${driver.name}\n🚗 Mashina: ${driver.vehicle}\n🔢 Raqam: ${driver.carNumber}\n📍 Uzoqlik: ${distance.toFixed(
            2
        )} km\n☎️ +${driver.phone}`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "❌ Buyurtmani bekor qilish", callback_data: "cancel_ride" }],
                ],
            },
        }
    );

    session.driverInfoMessageId = infoMsg.message_id;

    await sleep(3000);
    deleteMessages(chatId);

    addToMessagesToDelete(chatId, infoMsg.message_id);
    addToMessagesToDelete(chatId, locationMsg.message_id);
    delete session.searchingMessage;
}
