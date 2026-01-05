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
import { rideAssignedPrompt } from "../../ui/prompts/rideAssignedPrompt";

export async function handleRideAssigned(
    bot: TelegramBot,
    chatId: number,
    data: RideAssignedPayload
) {
    const { driver, location } = data;

    const session = getSession(chatId);
    if (!driver || !session || !location) return;

    // Send live location
    const { lat, lon } = location;
    const locationMsg = await bot.sendLocation(chatId, lat, lon, { live_period: 900 });
    session.messageId = locationMsg.message_id;
    session.driverId = data.driver.id;
    // Send driver info
    const infoMsg = await rideAssignedPrompt(chatId, data);

    await flushAllDeletionQueues()
    queueMessageForDeletion(chatId, infoMsg.message_id);
    queueMessageForDeletion(chatId, locationMsg.message_id);
    delete session.searchingMessage;
}
