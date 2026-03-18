import { PassengerModel } from "../models/PassengerModel";
import { RestaurantModel } from "../models/Restaurant";
import { sendToToken, SendToTokenInput, stringifyData } from "./notifications";
import admin from 'firebase-admin';

export const FcmService = {
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
                    data: {}
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
                    data: {}
                });

                console.log('FCM message id: ', messageId);
            })
            .catch((err) => {
                console.error("FCM send failed:", err);
            });
    },



    async sendToToken(input: SendToTokenInput): Promise<string> {
        const { token, title, body, data } = input;

        const message = {
            token,
            notification: { title, body },
            data: stringifyData(data),
            android: {
                notification: {
                    sound: "taxi_ringtone_parallel",
                    // channelId is important on Android 8+ (see section 3)
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
    }

}