import TelegramBot, { Message } from "node-telegram-bot-api";
import { userBot } from "../PassengerBot";

export function handleMessage(msg: Message) {
    const text = msg.text || "";
    const entities = msg.entities || [];

    for (const entity of entities) {
        if (entity.type === "custom_emoji" && entity.custom_emoji_id) {
            const emojiId = entity.custom_emoji_id;

            console.log("Custom emoji detected:", emojiId);

            // Send the same custom emoji back to the user
            userBot.sendMessage(msg.chat.id, text, {
                entities: [
                    {
                        type: "custom_emoji",
                        offset: 0,
                        length: text.length,
                        custom_emoji_id: emojiId,
                    },
                ],
            });
        }
    }
}
