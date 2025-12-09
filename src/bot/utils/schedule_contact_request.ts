import { getSession } from "../services/sessionManager";
import { contactRequestPrompt } from "../ui/prompts/contactRequestPrompt";
import { queueMessageForDeletion } from "./message_cleanup_manager";

export function scheduleContactRequest(chatId: number) {
    const DELAY = 5_000; // 30 seconds

    setTimeout(async () => {
        const session = getSession(chatId);

        // Do not ask if:
        if (session.searchFinished) return;     // ride already resolved
        if (session.phone) return;              // user already shared phone number

        try {
            const sent = await contactRequestPrompt(chatId);
            session.currentMsgId = sent.message_id;
            queueMessageForDeletion(chatId, sent.message_id);
        } catch (err) {
            console.error("Failed to send phone request:", err);
        }

    }, DELAY);
}