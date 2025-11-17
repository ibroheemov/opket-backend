// src/bot/handlers/rideHandlers.ts
import TelegramBot, { Message, CallbackQuery } from "node-telegram-bot-api";
import axios from "axios";

type LocationDto = { lat: number; lon: number };

type DriverPreview = {
    id: string;
    name: string;
    vehicle: string;
    eta?: number; // backend may provide this
};

type RideDto = {
    id: string;
    userId?: string;
    pickup?: LocationDto;
};

type RequestRideResponse = {
    ride: RideDto;
    driver: DriverPreview | null;
};

export async function handleLocation(bot: TelegramBot, msg: Message, backendBase: string) {
    if (!msg.location) return;

    const pickup: LocationDto = { lat: msg.location.latitude, lon: msg.location.longitude };
    const userId = msg.from!.id.toString();

    try {
        // tell axios what shape to expect
        const res = await axios.post<RequestRideResponse>(`${backendBase}/request`, { userId, pickup });
        const data = res.data;

        // defensive runtime validation (in addition to the type)
        if (!data || typeof data !== "object") {
            await bot.sendMessage(msg.chat.id, "❌ Unexpected response from backend.");
            return;
        }

        if (!data.driver) {
            await bot.sendMessage(msg.chat.id, "😞 Sorry, no drivers nearby right now.");
            return;
        }

        const { ride, driver } = data;

        const text =
            `🚖 Nearest driver found!\n\n` +
            `👤 *${driver.name}*\n🚘 ${driver.vehicle}\n` +
            `⏱️ ETA: ${driver.eta ?? "—"} min\n\n` +
            `Would you like to confirm this ride?`;

        await bot.sendMessage(msg.chat.id, text, {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "✅ Confirm Ride",
                            // use a compact payload; prefer JSON string if ids may contain underscores
                            callback_data: `confirm_${ride.id}_${driver.id}`,
                        },
                    ],
                ],
            },
        });
    } catch (error: any) {
        console.error("handleLocation error:", error?.message ?? error);
        await bot.sendMessage(msg.chat.id, "❌ Something went wrong while requesting a ride.");
    }
}

export async function handleRideConfirmation(bot: TelegramBot, query: CallbackQuery, backendBase: string) {
    try {
        const data = query.data;
        if (!data) {
            await bot.answerCallbackQuery(query.id!, { text: "Invalid action" });
            return;
        }

        if (!data.startsWith("confirm_")) return;

        // split carefully; if your IDs may include underscores consider encoding the payload as JSON instead
        const parts = data.split("_");
        // expected ["confirm", "<rideId>", "<driverId>"]
        if (parts.length < 3) {
            await bot.answerCallbackQuery(query.id!, { text: "Invalid confirmation payload" });
            return;
        }
        const rideId = parts[1];
        const driverId = parts.slice(2).join("_"); // join rest to be robust if driverId contains underscores

        await axios.post(`${backendBase}/confirm`, { rideId, driverId });

        await bot.answerCallbackQuery(query.id!, { text: "Ride confirmed!" });
        await bot.sendMessage(query.message!.chat.id, "✅ Your ride has been confirmed!\nWaiting for driver...");
    } catch (err: any) {
        console.error("handleRideConfirmation error:", err?.message ?? err);
        try {
            await bot.sendMessage(query.message!.chat.id, "❌ Failed to confirm ride.");
        } catch { }
    }
}
