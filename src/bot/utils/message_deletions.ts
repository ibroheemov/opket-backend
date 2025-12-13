import TelegramBot from "node-telegram-bot-api";
import { userBot } from "../PassengerBot";
import { getSession } from "../services/sessionManager";

export async function safeDeleteMessage(chatId: number, messageId?: number) {
    if (!messageId) return;
    try {
        await userBot.deleteMessage(chatId, messageId);
    } catch {
        // ignore missing/deleted message
    }
}

export async function deleteMessages(chatId: number) {
    const session = getSession(chatId);

    session.messagesToDelete.forEach((messageId) => {
        safeDeleteMessage(chatId, messageId);
    });
    session.messagesToDelete = [];
}

export async function addToMessagesToDelete(chatId: number, messageId: number) {
    const session = getSession(chatId);
    session.messagesToDelete = [...session.messagesToDelete, messageId];
}

export function logError(context: string, err: any) {
    console.error(`[${context}]`, err.response?.data || err.message || err);
}
