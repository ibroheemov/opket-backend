import { driverSockets, userSockets, socketIo } from "./socket.maps";
import { DriverModel } from "../models/DriverModel";
import { RideModel } from "../models/Ride";
import { updateRideStatus, emitToUser, emitToDriver } from "./ride.socket";
import { driverStore } from "../store/driverStore";
import { DriverSocketConnectionPayload, RideCompletedPayload, RideProgressPayload, RideStartedPayload } from "../bot/socket/types";
import { handleSocketError } from "../utils/socketError";
import { RideService } from "../services/ride.service";
import { fareConfigs } from "../data/fare.database";
import { PassengerModel } from "../models/PassengerModel";


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
    driverStore.upsert(
        driverId,
        {
            socketId: socket.id,
            status: "online",
            socketStatus: "connected",
            fcmToken,
            location: location,
            canReceiveOffers,
        }
    );



    if (!canReceiveOffers) {
        socket.emit("no_balance", { balance: driver.balance });
        console.error("🟡❌ DRIVER => NO BALANCE", driverId);
    }

    // 2️⃣ Handle location updates
    socket.on("driver_location", async ({ lat, lon, bearing }) => {
        if (!lat || !lon) return;
        console.error("🟡📍 DRIVER => LOCATION UPDATE", driverId);

        // update driver's current location in DB
        await DriverModel.findByIdAndUpdate(driverId, {
            location: { lat, lon },
            lastUpdated: new Date(),
        });
        driverStore.updateLocation(driverId, { lat, lon, bearing },);
        const driverSession = driverStore.get(driverId);
        if (driverSession?.currentRideId) {
            const ride = await RideModel.findById(driverSession?.currentRideId);
            if (ride && ride.userPhoneNumber) {
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
        driverStore.upsert(driverId, { status: "online" });
    });

    socket.on("driver_offline", () => {
        driverStore.upsert(driverId, { status: "offline" });
        console.error("🟡🔕 DRIVER => OFFLINE", driverId);
    });

    socket.on("accept_ride", async ({ rideId }: { rideId: string }) => {
        try {
            await RideService.acceptRide(rideId, driverId);
        } catch (err) {
            handleSocketError(socket, (err as Error).message, err as Error);
        }
    });


    socket.on("fcm_token_update", async (token) => {
        driverStore.upsert(driverId, { fcmToken: token });
    });

    socket.on("ride_closed", async ({ chatId }: { chatId: number }) => {
        const sSent = emitToUser(Number(chatId), 'ride_closed', {});
    });

    socket.on("balance_deduction_request", async ({ amount, phone }: { amount: number, phone: number }) => {
        const driver = await DriverModel.findById(driverId);
        if (!driver) return;
        const sSent = emitToUser(Number(phone), 'balance_deduction_request', { amount, driverId, driverName: driver.name });

        console.log(sSent, amount);

    });

    socket.on("ride_progress", async (data: RideProgressPayload) => {
        const driverSession = driverStore.get(driverId);
        if (!driverSession?.currentRideId) {
            return;
        };
        const ride = await RideModel.findById(driverSession.currentRideId);
        if (!ride) {
            socket.emit("error", { message: "Ride not found" });
            return;
        };
        if (data) emitToUser(ride.userChatId, "ride_progress", data);
    });

    socket.on("driver_arrived", async ({ rideId }) => {
        const ride = await updateRideStatus(rideId, "arrived");
        if (ride) emitToUser(ride.userChatId, "ride_status_update", { status: "arrived", message: "🚖 Haydovchi yetib keldi!" });
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
        const luggageCharge = fareConfigs['default'].luggageCharge;

        const sent = await emitToUser(phone, "add_luggage", { luggageCharge, driverId });

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
        const driver = driverStore.get(driverId);
        if (!driver) return;

        driverStore.upsert(driverId, {
            socketStatus: "disconnected",
        })

    });

    const passenger_in_store = driverStore.get(driverId);

    if (driver.events.length != 0 && passenger_in_store) {
        for (const event of driver.events) {
            await emitToDriver(driverId, event.event, event.data);
        }
    }
};
