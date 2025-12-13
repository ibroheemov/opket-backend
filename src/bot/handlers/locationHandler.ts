import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import { driverSessions } from "../sessions";
import { showMainMenu } from "./menuHandler";

export function setupLocationHandler(bot: TelegramBot, backendUrl: string) {
    bot.on("location", async (msg) => {
        const chatId = msg.chat.id;
        const session = driverSessions[chatId];
        const token = session?.token;
        if (!token) return bot.sendMessage(chatId, "⚠️ Please log in first.");

        const { latitude, longitude, } = msg.location!;
        // ✅ Log every location event

        try {
            await axios.post(`${backendUrl}/driver/update-location`, { lat: latitude, lon: longitude, chatId: chatId }, { headers: { Authorization: `Bearer ${token}` } });
            await axios.post(`${backendUrl}/driver/status`, { status: "online" }, { headers: { Authorization: `Bearer ${token}` } });
            driverSessions[chatId].status = "online";
            const sent = await bot.sendMessage(chatId, "🟢 Siz linyadasiz, buyrtma kelishi bilan xabar beramiz 🚖",
                {
                    reply_markup: {
                        keyboard: [[{ text: "🔴 Linyadan Chqish", }]],
                        resize_keyboard: true,
                    },

                });
            driverSessions[chatId].messagesToDelete.forEach((msgId) => {
                bot.deleteMessage(chatId, msgId);
            })
            session.messagesToDelete = [];
            session.messagesToDelete.push(sent.message_id);
            // session.messagesToDelete.push(msg.message_id);
        } catch (err: any) {
            bot.sendMessage(chatId, `❌ Location update failed: ${err.response?.data?.error || err.message}`);
        }
    });

    bot.on("edited_message", (msg) => {
        if (msg.location) {
            const chatId = msg.chat.id;
            const { latitude, longitude } = msg.location;
            const token = driverSessions[chatId]?.token;

            const session = driverSessions[chatId];

            if (!token) return;
            // // Optionally forward to backend
            axios.post(`${backendUrl}/driver/update-location`, {
                lat: latitude,
                lon: longitude,
                chatId,
            }, { headers: { Authorization: `Bearer ${token}` } });
        }
    });
}
