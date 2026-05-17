import { DriverModel } from "../models/DriverModel";
import { PassengerModel } from "../models/PassengerModel";
import { redis } from "../redis/redisClient";
import { NotificationTemplates } from "./notification.templates";
import { PushPayload, PushTransport } from "./push.transport";

// notification.service.ts
type DriverLike = {
    carColor?: string;
    carModel?: string;
};

export const NotificationService = {

    /*
     -------------------------
     CORE SEND
     -------------------------
    */

    async send(
        token: string,
        payload: PushPayload
    ) {
        try {
            return await PushTransport
                .sendToToken(
                    token,
                    payload
                );
        } catch (err) {
            console.error(
                "Push send failed:",
                err
            );
        }
    },

    /*
     -------------------------
     TOKEN RESOLUTION
     -------------------------
    */

    async resolvePassengerToken(
        userPhone?: number
    ): Promise<string | null> {

        if (!userPhone)
            return null;

        const cacheKey =
            `passenger:fcm:${userPhone}`;

        const cached =
            await redis.get(cacheKey);

        if (cached)
            return cached;

        const passenger =
            await PassengerModel.findOne({
                phone: userPhone,
            })
                .select("fcmToken")
                .lean();

        if (!passenger?.fcmToken)
            return null;

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

        const cacheKey =
            `driver:fcm:${driverId}`;

        const cached =
            await redis.get(cacheKey);

        if (cached)
            return cached;

        const driver =
            await DriverModel.findById(
                driverId
            )
                .select("fcmToken")
                .lean();

        if (!driver?.fcmToken)
            return null;

        await redis.set(
            cacheKey,
            driver.fcmToken,
            { EX: 86400 }
        );

        return driver.fcmToken;
    },

    /*
     -------------------------
     PASSENGER API
     -------------------------
    */

    passenger: {

        async driverAssigned(
            params: {
                fcmToken: string;
                driver?: DriverLike;
            }
        ) {

            const token = params.fcmToken;

            if (!token)
                return;

            return NotificationService.send(
                token,

                NotificationTemplates
                    .passenger
                    .driverAssigned(
                        params.driver
                    )
            );
        },

        async noDrivers(
            params: {
                userPhone?: number;
                fcmToken?: string;
            }
        ) {

            const token =
                params.fcmToken ||
                await NotificationService
                    .resolvePassengerToken(
                        params.userPhone
                    );

            if (!token)
                return;

            return NotificationService.send(
                token,

                NotificationTemplates
                    .passenger
                    .noDrivers()
            );
        },
    },

    /*
     -------------------------
     DRIVER API
     -------------------------
    */

    driver: {

        async rideCancelled(
            driverId: string
        ) {

            const token =
                await NotificationService
                    .resolveDriverToken(
                        driverId
                    );

            if (!token)
                return;

            return NotificationService.send(
                token,

                NotificationTemplates
                    .driver
                    .rideCancelled()
            );
        },

        async newRideOffer(
            driverId: string
        ) {

            const token =
                await NotificationService
                    .resolveDriverToken(
                        driverId
                    );

            if (!token)
                return;

            return NotificationService.send(
                token,

                NotificationTemplates
                    .driver
                    .newRideOffer()
            );
        },

        async forcedOffline(
            driverId: string
        ) {

            const token =
                await NotificationService
                    .resolveDriverToken(
                        driverId
                    );

            if (!token)
                return;

            return NotificationService.send(
                token,

                NotificationTemplates
                    .driver
                    .forcedOffline()
            );
        },
    },
};