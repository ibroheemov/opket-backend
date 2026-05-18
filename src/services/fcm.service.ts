import { DriverModel } from "../models/DriverModel";
import { PassengerModel } from "../models/PassengerModel";
import { RestaurantModel } from "../models/Restaurant";
import { sendToToken, SendToTokenInput, stringifyData } from "./notifications";
import admin from 'firebase-admin';

export const FcmService = {
    async sendDriverMessage(params: { id: string, title: string, body: string }) {
        const { id, title, body } = params;

        const promise = DriverModel.findByIdAndUpdate(id)
            .select("fcmToken")
            .lean()
            .exec();

        void promise
            .then(async (p) => {
                const token = p?.fcmToken;
                if (!token) return;

                const messageId = await this.sendToToken({
                    token,
                    title,
                    body,
                    data: {},
                    channelId: "default_channel",
                });
                console.log('FCM message id: ', messageId);
            })
            .catch((err) => {
                console.error("FCM send failed:", err);
            });
    },

    async sendRestaurantMessage(params: { id: string, title: string, body: string }) {
        const { id, title, body } = params;
        console.log(title);


        const passengerPromise = RestaurantModel.findByIdAndUpdate(id)
            .select("fcmToken")
            .lean()
            .exec();

        void passengerPromise
            .then(async (p) => {

                const token = p?.fcmToken;

                console.log(token);

                if (!token) return;

                const messageId = await this.sendToToken({
                    token,
                    title,
                    body,
                    data: {},
                    sound: "taxi_ringtone_parallel",
                    channelId: "default_channel",
                });

                console.log('FCM message id: ', messageId);
            })
            .catch((err) => {
                console.error("FCM send failed:", err);
            });
    },


    async sendPassengerMessage(params: { id: string, title: string, body: string }) {
        const { id, title, body } = params;

        console.log(id, title, body);


        const passengerPromise = PassengerModel.findByIdAndUpdate(id)
            .select("fcmToken")
            .lean()
            .exec();

        void passengerPromise
            .then(async (p) => {

                const token = p?.fcmToken;

                console.log("TOKEN:", token);

                if (!token) return;

                const messageId = await this.sendToToken({
                    token,
                    title,
                    body,
                    data: {},
                    sound: "taxi_ringtone_parallel",
                    channelId: "default_channel",
                });

                console.log('FCM message id: ', messageId);
            })
            .catch((err) => {
                console.error("FCM send failed:", err);
            });
    },



    async sendToToken(input: SendToTokenInput): Promise<string> {
        const { token, title, body, data, sound, channelId } = input;

        const message = {
            token,
            notification: { title, body },
            data: stringifyData(data),
            android: {
                notification: {
                    sound: "taxi_ringtone_parallel",
                    channelId: "default_channel",
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
    },

    // Data-only push that wakes the driver app even when it is killed.
    // No 'notification' key — the app builds and shows the notification itself
    // so the driver sees the same full-screen ride offer UI regardless of app state.
    async sendRideOffer({
        fcmToken,
        payload,
        ttlMs,
    }: {
        fcmToken: string;
        payload: object;
        ttlMs: number;
    }): Promise<void> {
        try {
            await admin.messaging().send({
                token: fcmToken,
                data: {
                    type: 'ride_offer',
                    // Entire offer payload as a single JSON string — FCM data
                    // values must be string:string, so we encode the object here
                    // and decode it on the Flutter side.
                    payload: JSON.stringify(payload),
                },
                android: {
                    // 'high' wakes the device even in Doze mode.
                    priority: 'high',
                    // Drop the message once the offer window has closed so the
                    // driver never receives a stale notification.
                    ttl: ttlMs,
                },
                apns: {
                    headers: {
                        // Priority 10 = immediate delivery (same as normal push).
                        'apns-priority': '10',
                        // 'background' push type triggers application:didReceiveRemoteNotification
                        // in a killed iOS app without showing a banner.
                        'apns-push-type': 'background',
                    },
                    payload: {
                        aps: {
                            // content-available: 1 wakes the killed iOS app.
                            'content-available': 1,
                        },
                    },
                },
            });
        } catch (err) {
            console.error(`FCM ride_offer failed for token ${fcmToken?.slice(0, 20)}…:`, err);
        }
    },

}