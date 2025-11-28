import TelegramBot from "node-telegram-bot-api";
import { addToMessagesToDelete, deleteMessages } from "../../utils/message_deletions";

export async function handleAddLuggage(bot: TelegramBot, chatId: number) {
    const message = await bot.sendMessage(chatId, "🛄 Haydovchi bagaj qo'shmoqchi, tasdiqlaysizmi ?", {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "❌ Yo'q", callback_data: "add_luggage_no" },
                    { text: "✅ Ha", callback_data: "add_luggage_yes" }
                ]
            ],
        },
    });
    deleteMessages(chatId);
    addToMessagesToDelete(chatId, message.message_id);
}
