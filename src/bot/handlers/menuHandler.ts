import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import { driverSessions } from "../sessions";

export async function showMainMenu(bot: TelegramBot, chatId: number) {
    const status = driverSessions[chatId]?.status || "offline";
    const buttons =
        status === "offline"
            ? [[{ text: "🟢 Linyada", callback_data: "go_online" }]]
            : [[{ text: "🔴 Linyadan Chqish", callback_data: "go_offline" }]];
    await bot.sendMessage(chatId, `Siz linyadasiz, buyrtma kelishi bilan xabar beramiz 🚖`, {
        reply_markup: { keyboard: buttons },
    });
}

export function setupMenuHandlers(bot: TelegramBot, backendUrl: string) {
    bot.on("callback_query", async (query) => {
        const chatId = query.message?.chat.id!;
        const action = query.data!;
        const token = driverSessions[chatId]?.token;
        if (!token) return bot.sendMessage(chatId, "⚠️ Please log in first.");

        if (action === "go_online") {
            bot.sendMessage(chatId, "📍 Please share your live location to go online.", {
                reply_markup: {
                    keyboard: [[{ text: "📍 Share Live Location", request_location: true }]],
                    resize_keyboard: true,
                    one_time_keyboard: true,
                },
            });
        } else if (action === "go_offline") {
            await axios.post(`${backendUrl}/driver/status`, { status: "offline" }, { headers: { Authorization: `Bearer ${token}` } });
            driverSessions[chatId].status = "offline";
            bot.sendMessage(chatId, "🔴 You are now offline.");
            // await showMainMenu(bot, chatId);
        }
    });
}
