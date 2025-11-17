import TelegramBot from "node-telegram-bot-api";
import { DriverLocationUpdatePayload } from "../types";
import { getSession } from "../../services/sessionManager";

export async function handleDriverLocationUpdate(
    bot: TelegramBot,
    chatId: number,
    { location }: DriverLocationUpdatePayload
) {
    const session = getSession(chatId);
    if (!session?.messageId) return;

    const last = session.lastLocation;
    const moved =
        last && Math.hypot(location.lat - last.lat, location.lon - last.lon) * 111_000;
    if (moved && moved < 5) return;

    try {
        await bot.editMessageLiveLocation(location.lat, location.lon, {
            chat_id: chatId,
            message_id: session.messageId,
        });
        session.lastLocation = location;
    } catch (err: any) {
        if (err.response?.body?.description?.includes("message is not modified")) {
            console.log("⏩ Skipped identical location update");
        } else {
            console.error("❌ Failed to update location:", err);
        }
    }
}
