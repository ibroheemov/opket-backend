import { DriverModel } from "../models/DriverModel";
import { PassengerModel } from "../models/PassengerModel";
import { redis } from "../redis/redisClient";
import { sendToToken } from "./notifications";

type PushPayload = {
    title: string;
    body: string;
    data?: Record<string, string>;
    sound?: string;
    channelId?: string;
};

type DriverLike = {
    carColor?: string;
    carModel?: string;
};

function formatDriverLabel(driver?: DriverLike) {
    return (
        [driver?.carColor, driver?.carModel]
            .filter(Boolean)
            .join(", ") || "Haydovchi"
    );
}

export const NotificationService = {
    /*
     * -------------------------
     * PUBLIC PASSENGER API
     * -------------------------
     */
    passenger: {
        async driverAssigned(params: {
            userPhone?: number;
            fcmToken?: string;
            driver?: DriverLike;
        }) {
            return NotificationService.sendToPassenger({
                ...params,
                payload: {
                    title: formatDriverLabel(params.driver),
                    body: "🚗 Haydovchi yo'lda",
                    sound: "taxi_ringtone_parallel",
                    channelId: "default_channel",
                },
            });
        },

        async noDrivers(params: {
            userPhone?: number;
            fcmToken?: string;
        }) {
            return NotificationService.sendToPassenger({
                ...params,
                payload: {
                    title: "Haydovchi topilmadi",
                    body: "Keyinroq urinib ko'ring",
                },
            });
        },
    },

    /*
     * -------------------------
     * PUBLIC DRIVER API
     * -------------------------
     */
    driver: {
        async rideCancelled(driverId: string) {
            return NotificationService.sendToDriver(driverId, {
                title: "Mijoz buyurtmani bekor qildi",
                body: "",
            });
        },

        async newRideOffer(driverId: string) {
            return NotificationService.sendToDriver(driverId, {
                title: "Yangi buyurtma",
                body: "Yangi safar taklifi bor",
            });
        },
    },

    /*
     * -------------------------
     * DELIVERY LAYER
     * -------------------------
     */

    async sendToPassenger(params: {
        userPhone?: number;
        fcmToken?: string;
        payload: PushPayload;
    }) {
        try {
            const token =
                params.fcmToken ||
                await this.resolvePassengerToken(params.userPhone);

            if (!token) return;

            return this.send(token, params.payload);

        } catch (err) {
            console.error("Passenger notification failed:", err);
        }
    },

    async sendToDriver(
        driverId: string,
        payload: PushPayload
    ) {
        try {
            const token = await this.resolveDriverToken(driverId);

            if (!token) return;

            return this.send(token, payload);

        } catch (err) {
            console.error("Driver notification failed:", err);
        }
    },

    async send(
        token: string,
        payload: PushPayload
    ) {
        return sendToToken({
            token,
            title: payload.title,
            body: payload.body,
            data: payload.data || {},
            sound: payload.sound || "default",
            channelId: payload.channelId || "default_channel",
        });
    },

    /*
     * -------------------------
     * TOKEN RESOLUTION
     * -------------------------
     */

    async resolvePassengerToken(
        userPhone?: number
    ): Promise<string | null> {
        if (!userPhone) return null;

        const cacheKey = `passenger:fcm:${userPhone}`;

        const cached = await redis.get(cacheKey);
        if (cached) return cached;

        const passenger = await PassengerModel.findOne({
            phone: userPhone,
        })
            .select("fcmToken")
            .lean();

        if (!passenger?.fcmToken) return null;

        await redis.set(
            cacheKey,
            passenger.fcmToken,
            { EX: 86400 }
        );

        return passenger.fcmToken;
    },

    async resolveDriverToken(
        driverId: string
    ): Promise<string | null> {

        const cacheKey = `driver:fcm:${driverId}`;

        const cached = await redis.get(cacheKey);
        if (cached) return cached;

        const driver = await DriverModel.findById(driverId)
            .select("fcmToken")
            .lean();

        if (!driver?.fcmToken) return null;

        await redis.set(
            cacheKey,
            driver.fcmToken,
            { EX: 86400 }
        );

        return driver.fcmToken;
    },
};