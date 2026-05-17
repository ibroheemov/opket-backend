// notification.templates.ts

import { PushPayload } from "./push.transport";



type DriverLike = {
    carColor?: string;
    carModel?: string;
};

function formatDriverLabel(
    driver?: DriverLike
) {
    return (
        [driver?.carColor, driver?.carModel]
            .filter(Boolean)
            .join(", ") ||
        "Haydovchi"
    );
}

export const NotificationTemplates = {

    passenger: {

        driverAssigned(
            driver?: DriverLike
        ): PushPayload {
            return {
                title: formatDriverLabel(
                    driver
                ),

                body: "🚗 Haydovchi yo'lda",

                sound:
                    "taxi_ringtone_parallel",

                channelId:
                    "default_channel",
            };
        },

        noDrivers(): PushPayload {
            return {
                title:
                    "Haydovchi topilmadi",

                body:
                    "Keyinroq urinib ko'ring",
            };
        },

        driverArrived(): PushPayload {
            return {
                title:
                    "Haydovchi yetib keldi",

                body:
                    "📍 Tashqariga chiqing",
            };
        },
    },

    driver: {

        rideCancelled(): PushPayload {
            return {
                title:
                    "Mijoz buyurtmani bekor qildi",

                body: "",
            };
        },

        newRideOffer(): PushPayload {
            return {
                title:
                    "Yangi buyurtma",

                body:
                    "Yangi safar taklifi bor",
            };
        },

        forcedOffline(): PushPayload {
            return {
                title: "Siz oflayn qilindingiz",
                body: "Sessiya muddati tugadi. Qayta ulanish uchun ilovani oching.",
                data: { type: "forced_offline" },
            };
        },
    },
};