import TelegramBot from "node-telegram-bot-api";
import { getSession } from "../../services/sessionManager";
import { safeDeleteMessage } from "../../utils/message_deletions";

export async function handleRideStarted(bot: TelegramBot, chatId: number) {
    const message = await bot.sendMessage(
        chatId,
        "🏁 Safaringiz boshlandi, Oq yo'l!\n\n Bosilgan masofa va Yo'l haqqini kuzatib boring👇",
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "📍 0.00 KM", callback_data: "no_action" },
                        { text: "💵 2000 UZS", callback_data: "no_action" },
                    ],
                ],
            },
        }
    );

    const session = getSession(chatId);
    session.fareMessageId = message.message_id;

    for (const msgId of session.messagesToDelete || []) {
        await safeDeleteMessage(chatId, msgId);
    }
}
