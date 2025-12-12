import TelegramBot from "node-telegram-bot-api";
import {
    addToMessagesToDelete,
    deleteMessages,
} from "../../utils/message_deletions";
import { getDistanceFromLatLonInKm, sleep } from "../../utils/helpers";
import { RideAssignedPayload } from "../types";
import { getSession } from "../../services/sessionManager";
import { driverStore } from "../../../store/driverStore";
import { flushAllDeletionQueues, queueMessageForDeletion } from "../../utils/message_cleanup_manager";
import { scheduleContactRequest } from "../../utils/schedule_contact_request";

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
    const { lat, lon } = location;
    const locationMsg = await bot.sendLocation(chatId, lat, lon, { live_period: 900 });
    session.messageId = locationMsg.message_id;

    // Send driver info
    const infoMsg = await bot.sendMessage(
        chatId,
        `Haydovchi yo'lda ☝️\n\n👨‍✈️Haydovchi: ${driver.name}\n🚗 Mashina: ${driver.carModel}, ${driver.carColor}\n🔢 Raqam: ${driver.carNumber}\n☎️ +998${driver.phone}`,
    );

    session.driverInfoMessageId = infoMsg.message_id;

    // await sleep(3000);
    await flushAllDeletionQueues()
    queueMessageForDeletion(chatId, infoMsg.message_id);
    queueMessageForDeletion(chatId, locationMsg.message_id);
    delete session.searchingMessage;

    // scheduleContactRequest(chatId);
}
