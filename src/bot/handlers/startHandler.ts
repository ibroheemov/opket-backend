import { Message } from "node-telegram-bot-api";
import { userBot } from "../PassengerBot";
import { addToMessagesToDelete, safeDeleteMessage } from "../utils/message_deletions";
import { config } from "../config/env";
import axios from "axios";

export const handleStart = async (msg: Message) => {
    const chatId = msg.chat.id;
    const sent = await sendLocationToToRequestRide(chatId);
    await axios.post(`${config.backendUrl}/user/create`, { chatId });

    addToMessagesToDelete(chatId, sent.message_id)
    // Delete the /start command message
    safeDeleteMessage(chatId, msg.message_id);
};

export async function sendLocationToToRequestRide(chatId: number): Promise<Message> {
    return userBot.sendMessage(
        chatId,
        "Taxi chaqirish uchun lokatsiyangizni yuboring👇",
        {
            reply_markup: {
                keyboard: [[{ text: "📍 Lokatsiya yuborish", request_location: true }]],
                resize_keyboard: true,
            },
        }
    );
}
