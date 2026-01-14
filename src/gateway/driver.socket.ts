import { driverSockets, userSockets, socketIo } from "./socket.maps";
import { DriverModel } from "../models/DriverModel";
import { RideModel } from "../models/Ride";
import { updateRideStatus, emitToUser, emitToDriver } from "./ride.socket";
import { driverStore } from "../store/driverStore";
import { DriverSocketConnectionPayload, RideCompletedPayload, RideProgressPayload, RideStartedPayload } from "../bot/socket/types";
import { handleSocketError } from "../utils/socketError";
// import { RideService } from "../services/ride.service";
import { RideService } from "../services/ride.new.service";
import { fareConfigs } from "../data/fare.database";
import { PassengerModel } from "../models/PassengerModel";
import { driverStoreRedis } from "../store/driverStoreRedis";
import { redis } from "../redis/redisClient";


export const registerDriverHandlers = async ({ socket, driverId, fcmToken, location }: DriverSocketConnectionPayload) => {
    const driver = await DriverModel.findById(driverId);

    if (!driver) {
        console.error("🟡❌ DRIVER => SOCKET CONNECTION - Driver not found in DB:", driverId);
        socket.emit("error", { message: "Driver not found" });
        return; // stop socket setup
    }

    console.log("🟡 DRIVER connected", location)


    const canReceiveOffers = driver.balance > 0;
    driverSockets.set(driverId, socket.id);

    // 1️⃣ Mark as online
    driverStoreRedis.upsert(
        driverId,
        {
            socketId: socket.id,
            status: "online",
            socketStatus: "connected",
            fcmToken,
            location: location,
            canReceiveOffers,
            name: driver.name,
            car: `${driver.carColor}, ${driver.carModel} - ${driver.carNumber}`,
            phone: driver.phone,
        }
    )

    if (!canReceiveOffers) {
        socket.emit("no_balance", { balance: driver.balance });
        console.error("🟡❌ DRIVER => NO BALANCE", driverId);
    }

    const passenger_in_store = await driverStoreRedis.get(driverId);

    if (driver.events.length != 0 && passenger_in_store) {
        for (const event of driver.events) {
            await emitToDriver(driverId, event.event, event.data);
        }
    }

    emitToDriver(driverId, "feature_flags", { 'driverStatusToggleEnabled': false });

    // 2️⃣ Handle location updates
    socket.on("driver_location", async ({ lat, lon, bearing }) => {
        if (!lat || !lon) return;
        // console.error("🟡📍 DRIVER => LOCATION UPDATE", driverId);
        driverStoreRedis.updateLocation(driverId, { lat, lon, bearing });

        const driverSession = await driverStoreRedis.get(driverId);
        if (driverSession?.currentRideId) {
            const ride = await RideModel.findById(driverSession?.currentRideId);
            if (ride && ride.userPhoneNumber && ride.status == "accepted") {
                emitToUser(ride.userPhoneNumber, "driver_location_update", {
                    driverId,
                    location: { lat, lon, bearing },
                    timestamp: Date.now(),
                })
            }
        }
    });

    // 3️⃣ Handle driver availability
    socket.on("driver_online", () => {
        driverStoreRedis.upsert(driverId, { status: "online" });
    });

    socket.on("driver_offline", () => {
        driverStoreRedis.upsert(driverId, { status: "offline" });
        console.error("🟡🔕 DRIVER => OFFLINE", driverId);
    });

    socket.on("accept_ride", async ({ rideId }: { rideId: string }) => {
        try {
            const res: { success: boolean } = await RideService.acceptRide(rideId, driverId);
            if (!res.success) {
                await new Promise(resolve => setTimeout(resolve, 200));
                emitToDriver(driverId, "ride_already_taken", {})
            };
        } catch (err) {
            handleSocketError(socket, (err as Error).message, err as Error);
        }
    });


    socket.on("fcm_token_update", async (token) => {
        driverStoreRedis.upsert(driverId, { fcmToken: token });
    });

    socket.on("ride_closed", async ({ chatId }: { chatId: number }) => {
        const sSent = emitToUser(Number(chatId), 'ride_closed', {});
    });

    socket.on("balance_deduction_request", async ({ amount, phone }: { amount: number, phone: number }) => {
        const sSent = emitToUser(Number(phone), 'balance_deduction_request', { amount, driverId, driverName: driver.name });
    });

    socket.on("ride_progress", async (data: RideProgressPayload) => {
        const driverSession = await driverStoreRedis.get(driverId);
        if (!driverSession?.currentRideId) {
            return;
        };
        const ride = await RideModel.findById(driverSession.currentRideId);
        if (!ride) {
            socket.emit("error", { message: "Ride not found" });
            return;
        };
        if (data) emitToUser(ride.userPhoneNumber, "ride_progress", data);
    });

    socket.on("driver_arrived", async ({ rideId }) => {
        const rideKey = `ride:${rideId}`;

        // 1️⃣ Update Redis state (authoritative)
        const updated = await redis.hSet(rideKey, {
            phase: "arrived",
            arrivedAt: Date.now().toString(),
        });

        if (!updated) return;

        // 2️⃣ Read required fields from Redis
        const { userPhoneNumber, userChatId } = await redis.hGetAll(rideKey);

        // 3️⃣ Emit event
        emitToUser(
            Number(userPhoneNumber),
            "driver_arrived",
            {
                status: "arrived",
                message: "🚖 Haydovchi yetib keldi!",
            }
        );

        // 4️⃣ Persist to Mongo asynchronously (history only)
        // updateRideStatusInMongo(rideId, "arrived").catch(console.error);
    });

    socket.on("ride_started", async (data: RideStartedPayload) => {
        const ride = await updateRideStatus(data.rideId, "started");
        if (ride) {
            const sent = emitToUser(ride.userPhoneNumber, "ride_started", data);
            console.log('ride_started', sent);

            await PassengerModel.updateOne(
                { phone: ride.userPhoneNumber },
                { $pull: { events: { event: "driver_location_update_ack" } } }
            );
        };
    });

    socket.on("add_luggage", async ({ phone }) => {
        console.log("ADD LUGGAGE EVENT");
        const luggageCharge = fareConfigs['default'].luggageCharge;

        emitToUser(phone, "add_luggage", { luggageCharge, driverId });
    });

    socket.on("ride_completed", async (data: RideCompletedPayload) => {
        try {
            await RideService.completeRide(driverId, data);
        } catch (err) {
            handleSocketError(socket, (err as Error).message, err as Error);
        }
    });

    // MISSED EVENTS
    socket.on("ride_cancelled_ack", async ({ eventId }) => {
        await DriverModel.findByIdAndUpdate(
            driverId,
            { $pull: { events: { event: eventId } } }
        );
    });

    socket.on("luggage_confirmed_ack", async ({ eventId }) => {
        await DriverModel.findByIdAndUpdate(
            driverId,
            { $pull: { events: { event: eventId } } }
        );
    });

    socket.on("luggage_declined_ack", async ({ eventId }) => {
        await DriverModel.findByIdAndUpdate(
            driverId,
            { $pull: { events: { event: eventId } } }
        );
    });

    socket.on("connect_error", (err) =>
        console.error("🟡❌ DRIVER Connection error:", err.message)
    );
    socket.on("disconnect", () => {
        console.log("🟡🔴 DRIVER disconnected");
        const driver = driverStoreRedis.get(driverId);
        if (!driver) return;

        driverStoreRedis.upsert(driverId, {
            socketStatus: "disconnected",
        })

    });


};
