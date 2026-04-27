// push.transport.ts

import admin, { messaging } from "firebase-admin";


type DataPayload = Record<string, string | number | boolean>;

export type PushPayload = {
    title: string;
    body: string;
    sound?: string;
    channelId?: string;
    data?: DataPayload;
};

export interface FailedToken {
    token: string;
    errorCode?: string;
    errorMessage?: string;
}

export interface MulticastResult {
    successCount: number;
    failureCount: number;
    responses: messaging.BatchResponse["responses"];
    failed: FailedToken[];
}

function stringifyData(
    data: DataPayload = {}
): Record<string, string> {
    return Object.fromEntries(
        Object.entries(data).map(
            ([k, v]) => [k, String(v)]
        )
    );
}

export const PushTransport = {
    async sendToToken(
        token: string,
        payload: PushPayload
    ): Promise<string> {

        return admin.messaging().send({
            token,

            notification: {
                title: payload.title,
                body: payload.body,
            },

            data: stringifyData(
                payload.data
            ),

            android: {
                notification: {
                    sound:
                        payload.sound ||
                        "notification_sound",

                    channelId:
                        payload.channelId ||
                        "general_notifications_v8",
                },
            },

            apns: {
                payload: {
                    aps: {
                        sound:
                            payload.sound ||
                            "default",
                    },
                },
            },
        });
    },

    async sendToTokens(
        tokens: string[],
        payload: PushPayload
    ): Promise<MulticastResult> {

        if (!tokens.length) {
            return {
                successCount: 0,
                failureCount: 0,
                responses: [],
                failed: [],
            };
        }

        const res =
            await admin.messaging()
                .sendEachForMulticast({
                    tokens,

                    notification: {
                        title: payload.title,
                        body: payload.body,
                    },

                    data: stringifyData(
                        payload.data
                    ),
                });

        const failed: FailedToken[] = [];

        res.responses.forEach(
            (r, i) => {
                if (!r.success) {
                    failed.push({
                        token: tokens[i],
                        errorCode: r.error?.code,
                        errorMessage: r.error?.message,
                    });
                }
            }
        );

        return {
            successCount: res.successCount,
            failureCount: res.failureCount,
            responses: res.responses,
            failed,
        };
    },

    async sendToTopic(
        topic: string,
        payload: PushPayload
    ) {
        return admin.messaging().send({
            topic,

            notification: {
                title: payload.title,
                body: payload.body,
            },

            data: stringifyData(
                payload.data
            ),
        });
    },
};