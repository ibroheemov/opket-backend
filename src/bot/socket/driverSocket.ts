import { io, Socket } from "socket.io-client";
import TelegramBot, { SendMessageOptions } from "node-telegram-bot-api";
import { driverSessions } from "../sessions";

export let driverSocket: Socket;

export function initDriverSocket(bot: TelegramBot, chatId: number, backendUrl: string, token: string): Socket {
    driverSocket = io(backendUrl, { auth: { token } });

    driverSocket.on("connect", () => {
        console.log(`✅ Driver ${chatId} connected via WebSocket`);
        // bot.sendVideo(chatId, 'src/bot/assets/livelocation.mp4', {
        //     caption: "👋 Assalomu Aleykum, Shohjahon Ibrohimov!\nBuyurtmalar qabul qilish uchun, yuqorida ko'rsatilganidek botga jonli lokatsiya yuboring",
        // });
    });

    driverSocket.on("disconnect", () => {
        bot.sendMessage(chatId, "🔴 Lost connection. Please go online again.");
    });

    driverSocket.on("ride_offer", async (ride: any) => {
        let timeLeft = 30;
        const session = driverSessions[chatId];
        // Create message
        const msgText = (sec: number) =>
            `🚘 Yangi buyurtma!\n⏰ *${sec}* soniya ichida qabul qiling`;

        const opts: SendMessageOptions = {
            parse_mode: "Markdown" as const, // ✅ make it a valid ParseMode literal
            reply_markup: {
                inline_keyboard: [
                    [{ text: "✅ Qabul qilish", callback_data: `accept_${ride.id}_${ride.userChatId}` }],
                    [{ text: "❌ O'tkazib yuborish", callback_data: `decline_${ride.id}` }],
                ],
            },
        };
        const sentMessage = await bot.sendMessage(chatId, msgText(30), opts);
        session.messagesToDelete.push(sentMessage.message_id);
        // Countdown interval
        const interval = setInterval(async () => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(interval);
                try {
                    await bot.editMessageText(
                        "❌ Vaqt tugadi. Buyurtma boshqa haydovchiga yuborildi.",
                        { chat_id: chatId, message_id: sentMessage.message_id }
                    );
                } catch (e) { }
                return;
            }

            // Update message text each second
            try {
                await bot.editMessageText(msgText(timeLeft), {
                    chat_id: chatId,
                    message_id: sentMessage.message_id,
                    parse_mode: "Markdown",
                    reply_markup: opts.reply_markup as TelegramBot.InlineKeyboardMarkup,
                });
            } catch (e) {
                // ignore "message is not modified" or edit errors
            }
        }, 1000);
    });


    driverSocket.on("user_location", async (data: any) => {
        const { lat, lon, address } = data;
        const session = driverSessions[chatId];

        // Send Telegram map location to driver
        const sentLocation = await bot.sendLocation(chatId, lat, lon);
        const sentMessage = await bot.sendMessage(chatId, '📍☝️ Mijoz sizni yuqoridagi manzilda kutyapti', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🚗 Arrived at pickup", callback_data: "arrived" }],
                    [{ text: "❌ Cancel ride", callback_data: "cancel_ride" }],
                ],
            },
        });
        session.messagesToDelete.forEach((id) => {
            bot.deleteMessage(chatId, id);
        })
        session.messagesToDelete = [];
        session.messagesToDelete.push(sentLocation.message_id);
        session.messagesToDelete.push(sentMessage.message_id);
    });

    driverSocket.on("ride_status", (status: any) => {
        // bot.sendMessage(chatId, `ℹ️ Ride status: ${status.status}`);
    });

    driverSocket.on("cancel_ride", (status: any) => {
        const session = driverSessions[chatId];
        bot.sendMessage(chatId, `❌ Client cancelled the ride`);
        session.messagesToDelete.forEach((id) => {
            bot.deleteMessage(chatId, id);
        })
    });

    driverSocket.on("error", (err: any) => {
        console.error("❌ Socket error:", err);
        bot.sendMessage(chatId, `❌ Socket error: ${err.message || err}`);
    });

    return driverSocket;
}
