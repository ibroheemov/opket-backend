// src/services/notifications.ts
import admin from 'firebase-admin';
import type { BatchResponse } from "firebase-admin/messaging";

type DataPayload = Record<string, string | number | boolean>;

export interface SendToTokenInput {
    token: string;
    title: string;
    body: string;
    data?: DataPayload;
}

export interface SendToTokensInput {
    tokens: string[];
    title: string;
    body: string;
    data?: DataPayload;
}

export interface SendToTopicInput {
    topic: string; // without "/topics/"
    title: string;
    body: string;
    data?: DataPayload;
}

export interface FailedToken {
    token: string;
    errorCode?: string;
    errorMessage?: string;
}

export interface MulticastResult {
    successCount: number;
    failureCount: number;
    responses: BatchResponse["responses"];
    failed: FailedToken[];
}

export function stringifyData(data: DataPayload = {}): Record<string, string> {
    // FCM "data" must be string:string
    return Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
    );
}

export async function sendToToken(input: SendToTokenInput): Promise<string> {
    const { token, title, body, data } = input;

    const message = {
        token,
        notification: { title, body },
        data: stringifyData(data),
        android: {
            notification: {
                sound: "notification_sound",
                // channelId is important on Android 8+ (see section 3)
                channelId: "general_notifications_v8",
            },
        },

        apns: {
            payload: {
                aps: {
                    sound: "default",
                },
            },
        },
    };

    // Returns messageId
    return admin.messaging().send(message);
}

export async function sendToTokens(
    input: SendToTokensInput
): Promise<MulticastResult> {
    const { tokens, title, body, data } = input;

    if (!tokens?.length) {
        return { successCount: 0, failureCount: 0, responses: [], failed: [] };
    }

    // NOTE: max 500 tokens per call
    const res = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: stringifyData(data),
    });

    const failed: FailedToken[] = [];
    res.responses.forEach((r, i) => {
        if (!r.success) {
            failed.push({
                token: tokens[i],
                errorCode: r.error?.code,
                errorMessage: r.error?.message,
            });
        }
    });

    return {
        successCount: res.successCount,
        failureCount: res.failureCount,
        responses: res.responses,
        failed,
    };
}

export async function sendToTopic(input: SendToTopicInput): Promise<string> {
    const { topic, title, body, data } = input;

    const message = {
        topic,
        notification: { title, body },
        data: stringifyData(data),
    };

    return admin.messaging().send(message);
}