import { userBot } from "../PassengerBot";

// Stores pending deletions: chatId → [messageIds]
const pendingDeletionQueue = new Map<number, number[]>();

/**
 * Queue a message for future deletion.
 */
export function queueMessageForDeletion(chatId: number, messageId: number) {
    if (!pendingDeletionQueue.has(chatId)) {
        pendingDeletionQueue.set(chatId, []);
    }
    pendingDeletionQueue.get(chatId)!.push(messageId);
}

/**
 * Delete a single message safely — never throws, logs only unexpected errors.
 */
export async function deleteMessageSafely(chatId: number, messageId: number) {
    try {
        await userBot.deleteMessage(chatId, messageId);
    } catch (err: any) {
        // Ignore expected Telegram errors
        const msg = err.response?.body?.description || "";

        if (
            msg.includes("message to delete not found") ||
            msg.includes("message can't be deleted") ||
            msg.includes("message identifier is not valid")
        ) {
            return;
        }

        console.error(`Unexpected error deleting message ${messageId} in chat ${chatId}:`, err);
    }
}

/**
 * Delete all queued messages for a specific chat.
 */
export async function flushDeletionQueue(chatId: number) {
    const messages = pendingDeletionQueue.get(chatId);
    if (!messages || messages.length === 0) return;

    for (const messageId of messages) {
        await deleteMessageSafely(chatId, messageId);
    }

    // Remove queue for this chat after cleanup
    pendingDeletionQueue.delete(chatId);
}

/**
 * Delete queued messages for every chat.
 */
export async function flushAllDeletionQueues() {
    for (const [chatId] of pendingDeletionQueue.entries()) {
        await flushDeletionQueue(chatId);
    }
}
