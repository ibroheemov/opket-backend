import { driverSockets, userSockets, socketIo } from "./socket.maps";
import { DriverModel } from "../models/DriverModel";
import { RideModel } from "../models/Ride";
import { updateRideStatus, emitToUser } from "./ride.socket";
import { driverStore } from "../store/driverStore";
import { DriverSocketConnectionPayload, RideCompletedPayload, RideProgressPayload, RideStartedPayload } from "../bot/socket/types";
import { handleSocketError } from "../utils/socketError";
import { RideService } from "../services/ride.service";


export const registerDriverHandlers = async ({ socket, driverId, fcmToken }: DriverSocketConnectionPayload) => {
    const driver = await DriverModel.findById(driverId);

    if (!driver) {
        console.error("🟡❌ DRIVER => SOCKET CONNECTION - Driver not found in DB:", driverId);
        socket.emit("error", { message: "Driver not found" });
        return; // stop socket setup
    }

    const canReceiveOffers = driver.balance > 0;
    driverSockets.set(driverId, socket.id);

    // 1️⃣ Mark as online
    driverStore.upsert(
        driverId,
        {
            socketId: socket.id,
            status: "online",
            fcmToken,
            // location: { lat: 37.42534332278696, lon: -122.07541496109042 },
            canReceiveOffers,
        }
    );

    if (!canReceiveOffers) {
        socket.emit("no_balance", { balance: driver.balance });
        console.error("🟡❌ DRIVER => NO BALANCE", driverId);
    }

    // 2️⃣ Handle location updates
    socket.on("driver_location", async ({ lat, lon }) => {
        if (!lat || !lon) return;

        // update driver's current location in DB
        await DriverModel.findByIdAndUpdate(driverId, {
            location: { lat, lon },
            lastUpdated: new Date(),
        });
        driverStore.updateLocation(driverId, { lat, lon });
        const driverSession = driverStore.get(driverId);
        if (driverSession?.currentRideId) {
            const ride = await RideModel.findById(driverSession?.currentRideId);
            if (ride && ride.userChatId) {
                const userSocketId = userSockets.get(Number(ride.userChatId));
                if (userSocketId) {
                    socketIo.to(userSocketId).emit("driver_location_update", {
                        driverId,
                        location: { lat, lon },
                        timestamp: Date.now(),
                    });
                }
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
        if (ride) emitToUser(ride.userChatId, "ride_started", data);
    });

    socket.on("add_luggage", async ({ rideId }) => {
        const ride = await RideModel.findById(rideId);
        // const ride = await updateRideStatus(rideId, "started");
        if (ride) emitToUser(ride.userChatId, "add_luggage", {});
    });

    socket.on("ride_completed", async (data: RideCompletedPayload) => {
        try {
            await RideService.completeRide(driverId, data);
        } catch (err) {
            handleSocketError(socket, (err as Error).message, err as Error);
        }
    });


    socket.on("connect_error", (err) =>
        console.error("🟡❌ DRIVER Connection error:", err.message)
    );
    socket.on("disconnect", () => console.log("🟡🔴 DRIVER disconnected"));
};
