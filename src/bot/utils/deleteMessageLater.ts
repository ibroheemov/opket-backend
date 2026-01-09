import { userBot } from "../PassengerBot";

export function deleteMessageLater(
    chatId: number,
    messageId: number,
    // delayMs: number
) {
    setTimeout(async () => {
        try {
            await userBot.deleteMessage(chatId, messageId);
        } catch { }
    }, 4000);
}
