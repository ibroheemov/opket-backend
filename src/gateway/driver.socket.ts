import { driverSockets, userSockets, socketIo } from "./socket.maps";
import { DriverModel } from "../models/DriverModel";
import { RideModel } from "../models/Ride";
import { updateRideStatus, emitToUser } from "./ride.socket";
import { driverStore } from "../store/driverStore";
import { DriverSocketConnectionPayload, RideCompletedPayload, RideProgressPayload, RideStartedPayload } from "../bot/socket/types";
import { handleSocketError } from "../utils/socketError";
import { RideService } from "../services/ride.service";


export const registerDriverHandlers = async ({ socket, driverId, fcmToken }: DriverSocketConnectionPayload) => {
    const driverSession = driverStore.get(driverId);
    const driver = await DriverModel.findById(driverId);

    if (!driver) {
        console.error("❌ Driver not found in DB:", driverId);
        socket.emit("error", { message: "Driver not found" });
        return; // stop socket setup
    }

    const canReceiveOffers = driver.balance > 0;

    driverSockets.set(driverId, socket.id);
    console.log(`🚗 Driver connected: DriverID: ${driverId}; FcmToken: ${fcmToken}`);
    // 1️⃣ Mark as online
    driverStore.upsert(
        driverId,
        {
            socketId: socket.id,
            status: "online",
            fcmToken,
            location: { lat: 37.42534332278696, lon: -122.07541496109042 }
        }
    );

    if (!canReceiveOffers) {
        socket.emit("no_balance", { balance: driver.balance });
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
        console.log(`📍 Driver[FG] ${driverId} location updated: ${lat}, ${lon}`);
    });

    // 3️⃣ Handle driver availability
    socket.on("driver_online", () => {
        driverStore.upsert(driverId, { status: "online" });
    });

    socket.on("driver_offline", () => {
        driverStore.upsert(driverId, { status: "offline" });
    });

    socket.on("accept_ride", async ({ rideId }: { rideId: string }) => {
        console.log(`📩 Driver ${driverId} accepting ride ${rideId}`);
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


    // socket.on("balance_updated", async ({ balance }: { balance: number }) => {
    //     console.log("balance_updated", balance);
    //     socket.emit("balance_updated", { balance });
    // });

    socket.on("ride_progress", async (data: RideProgressPayload) => {
        console.log("RIDE PROGRESS", data);
        const driverSession = driverStore.get(driverId);
        if (!driverSession?.currentRideId) {
            console.log("Ride not found");
            return;
        };
        const ride = await RideModel.findById(driverSession.currentRideId);
        if (!ride) {
            console.log("Ride not found");
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
        console.log(`🏁 Driver ${driverId} completing ride ${data.rideId}`);

        try {
            await RideService.completeRide(driverId, data);
        } catch (err) {
            handleSocketError(socket, (err as Error).message, err as Error);
        }
    });


    socket.on("disconnect", () => {
        // driverSockets.delete(driverId);
        console.log(`❌ Driver disconnected: ${driverId}`);
    });
};
