import { driverSockets } from "./socket.maps";
import { DriverModel } from "../models/DriverModel";
import { emitToUser, emitToDriver } from "./ride.socket";
import { DriverSocketConnectionPayload, RideCompletedPayload, RideProgressPayload, RideStartedPayload } from "../bot/socket/types";
import { handleSocketError } from "../utils/socketError";
import { RideService } from "../services/ride.new.service";
import { fareConfigs } from "../data/fare.database";
import { PassengerModel } from "../models/PassengerModel";
import { redis } from "../redis/redisClient";
import { payfareTransfer } from "../services/payfare.service";
import { RideRepository } from "../repositories/ride.repository";
import { DriverSocketEvents } from "../utils/enums";
import { DriverSocketLocationBody, DriverSocketLocationToPassengerBody } from "../types/driver.types";
import { driverLocationStore } from "../store/driver.location.store";
import { driverSessionStore } from "../store/driver.session.store";
import { driverCapabilityStore } from "../store/driver.capability.store";

export const registerDriverHandlers = async ({ socket, driverId }: DriverSocketConnectionPayload) => {
    const driver = await DriverModel.findById(driverId)
        .populate("tariffs");

    if (!driver) {
        console.error("🟡❌ DRIVER => SOCKET CONNECTION - Driver not found in DB:", driverId);
        socket.emit("error", { message: "Driver not found" });
        return; // stop socket setup
    }

    driverSockets.set(driverId, socket.id);
    console.log("🟢 DRIVER CONNECTED");

    // Re-emit any active parallel offer the driver had before reconnecting
    const activePayload = await redis.get(`driver_offer_payload:${driverId}`);
    if (activePayload) {
        try {
            const payload = JSON.parse(activePayload);
            const rideData = await redis.hGetAll(`ride:${payload.ride_id}`);
            const phase = rideData?.phase;
            if (phase && !['accepted', 'cancelled', 'expired'].includes(phase)) {
                socket.emit("ride_offer", payload);
            }
        } catch (err) {
            console.error("Failed to re-emit parallel offer on reconnect:", err);
        }
    }

    // ############## START OF NEW ##############
    socket.on(DriverSocketEvents.LOCATION_TO_PASSENGER, async (data: DriverSocketLocationToPassengerBody) => {
        const emitted = await emitToUser(data.phone, DriverSocketEvents.LOCATION, data);

        console.log(DriverSocketEvents.LOCATION_TO_PASSENGER, emitted);

    });
    // ############## END OF NEW ##############

    socket.on("ride_progress", async (data: RideProgressPayload) => {
        console.log(data);
        const session = await driverSessionStore.getCurrentSession(driverId);

        if (session?.userPhoneNumber) {
            emitToUser(session?.userPhoneNumber, "ride_progress", data);
        }

        const rideId = await redis.hGet(`driver:${driverId}`, "currentRideId");
        if (rideId) {
            await redis.set(
                `ride_progress:${rideId}`,
                JSON.stringify({ fare: data.fare, distance: data.distance }),
                { EX: 4 * 60 * 60 },
            );
        }
    });

    socket.on("ride_started", async (data: RideStartedPayload) => {
        const ride = await RideRepository.setRideStatus(data.rideId, "started", { by: "driver" })
        if (ride) {
            const sent = emitToUser(ride.userPhoneNumber, "ride_started", data);
            console.log('ride_started', sent);

            await PassengerModel.updateOne(
                { phone: ride.userPhoneNumber },
                { $pull: { events: { event: "driver_location_update_ack" } } }
            );

            const userPhone = Number(ride.userPhoneNumber);
            const title = 'Haydovchi taksometrni yoqdi';
            const body = 'Taksometr pul yozishni boshladi';

            RideService.sendPassengerMessage({ userPhone, title, body });
        };
    });

    socket.on("ride_completed", async (data: RideCompletedPayload) => {
        try {
            await RideService.completeRide({ ...data, driverId });
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

    socket.on("connect_error", (err) =>
        console.error("🟡❌ DRIVER Connection error:", err.message)
    );

    socket.on("disconnect", async () => {
        setTimeout(async () => {
            const current = driverSockets.get(driverId);

            if (current !== socket.id) {
                return; // replaced by new connection
            }

            // If the driver's session hash is still alive it means the background
            // service is still sending HTTP heartbeats (app was killed but the
            // Android foreground service survived). Keep the driver online so the
            // status screen shows correctly when they re-open the app; just clear
            // the stale socket entry so the next connection registers cleanly.
            const session = await driverSessionStore.getCurrentSession(driverId);
            if (session) {
                driverSockets.delete(driverId);
                return;
            }

            console.error("🟡❌ DRIVER DISCONNECTED");
            // 1 remove from online
            await driverSessionStore.setOffline(driverId);

            // 2 remove from geo indexes
            await driverLocationStore.removeDriver(driverId);

            // 3 fetch services
            const driver = await DriverModel.findById(driverId).select("enabledOptions");

            const services = driver?.enabledOptions ?? [];

            // 4 remove from capability sets
            await driverCapabilityStore.removeDriver(driverId, services);
        }, 5000);
    });
};

