import TelegramBot from "node-telegram-bot-api";
import { RideProgressPayload } from "../types";
import { getSession } from "../../services/sessionManager";
import { payFarePrompt } from "../../ui/prompts/payFarePrompt";
import { queueMessageForDeletion } from "../../utils/message_cleanup_manager";

export async function handleBalanceDeduction(
    chatId: number,
    { amount, driverId }: { amount: number, driverId: string }
) {
    const session = getSession(chatId);
    session.deduction_amount = amount;
    session.driverId = driverId;

    try {
        const sent = await payFarePrompt(chatId, amount);
        queueMessageForDeletion(chatId, sent.message_id);
    } catch (err) {
        console.error("❌ Failed to update fare message:", err);
    }
}
