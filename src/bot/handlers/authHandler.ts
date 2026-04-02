import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import { driverSessions } from "../sessions";
import { initDriverSocket } from "../socket/driverSocket";
import { showMainMenu } from "./menuHandler";
import { config } from "../config/env";

interface Driver {
    _id: string;
    name: string;
    vehicle: string;
}

interface VerifyOtpResponse {
    token: string;
}

interface GetDriveResponse {
    success: boolean;
    driver?: Driver;
}

interface RequestOtp {
    message: string;
    otp?: string;
}

export function setupAuthHandlers(bot: TelegramBot, backendUrl: string) {
    // /start command
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        driverSessions[chatId] = { messagesToDelete: [] };
        const session = driverSessions[chatId];

        if (session?.token) return showMainMenu(bot, chatId);

        const res = await axios.get<GetDriveResponse>(`${backendUrl}/driver/get-driver?chatId=${chatId}`);
        const { success, driver } = res.data;

        if (success && driver) {
            const sent = await bot.sendMessage(chatId, `${driver.name}, Xush kelibsiz! Ishlashni boshlash uchun jonli lokatsiya yuboring`);
        } else {
            const sent = await bot.sendMessage(chatId, "Oson Driver ga Xush kelibsiz! Haydovchi bo'lish uchun pastdagi tugmani bosing👇", {
                reply_markup: {
                    inline_keyboard: [[{ text: "🚕 Haydovchi bo'lish", callback_data: "no_callback" }]],
                },
            });
            session.messagesToDelete.push(sent.message_id);
        }



    });

    // handle contact
    bot.on("contact", async (msg) => {
        const chatId = msg.chat.id;
        // driverSessions[chatId] = { messagesToDelete: [] };
        const session = driverSessions[chatId];
        const phone = msg.contact?.phone_number;
        driverSessions[chatId].messagesToDelete.push(msg.message_id);

        if (!phone) return;

        try {
            const res = await axios.post<RequestOtp>(`${backendUrl}/driver/request-otp`, { phone, chatId });
            if (res.data.otp) {
                verifyOtp(bot, chatId, phone, res.data.otp);
            } else {
                bot.sendMessage(chatId, "✅ OTP sent to your Telegram! Enter the 6-digit code.");
            }
            driverSessions[chatId].phone = phone;
        } catch (err: any) {
            bot.sendMessage(chatId, `❌ Login failed: ${err.response?.data?.error || err.message}`);
        }
    });

    // handle OTP
    bot.on("message", async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text?.trim();
        if (!/^\d{6}$/.test(text || "")) return;

        const session = driverSessions[chatId];
        if (!session?.phone) return bot.sendMessage(chatId, "⚠️ Please start again with /start.");
        verifyOtp(bot, chatId, session.phone, text);

    });
}

async function verifyOtp(bot: TelegramBot, chatId: number, phone: string, otp?: string) {
    try {
        const res = await axios.post<VerifyOtpResponse>(`${config.backendUrl}/driver/verify-otp`, {
            phone: phone,
            otp: otp,
        });
        const token = res.data.token;
        driverSessions[chatId].token = token;
        driverSessions[chatId].status = "offline";

        initDriverSocket(bot, chatId, config.backendUrl, token);
        // await showMainMenu(bot, chatId);
        const sent = await bot.sendVideo(chatId, 'src/bot/assets/livelocation.mp4', {
            caption: "👋 Assalomu Aleykum, Shohjahon Ibrohimov!\nBuyurtmalar qabul qilish uchun, yuqorida ko'rsatilganidek botga jonli lokatsiya yuboring",
        });
        driverSessions[chatId].messagesToDelete.forEach((msgId) => {
            bot.deleteMessage(chatId, msgId);
        })
        driverSessions[chatId].messagesToDelete = [];
        driverSessions[chatId].messagesToDelete.push(sent.message_id);
    } catch (e: any) {
        bot.sendMessage(chatId, `❌ OTP invalid: ${e.response?.data?.error || e.message}`);
    }
}