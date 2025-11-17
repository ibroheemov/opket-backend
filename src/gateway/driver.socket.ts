import { Socket } from "socket.io";
import { driverSockets, userSockets, socketIo } from "./socket.maps";
import { DriverModel } from "../models/DriverModel";
import { RideModel } from "../models/Ride";
import { updateRideStatus, emitToUser } from "./ride.socket";
import { driverStore } from "../store/driverStore";
import { RideProgressPayload } from "../bot/socket/types";
import { handleRideCommission } from "../utils/fare.helper";

export const registerDriverHandlers = async (socket: Socket, driverId: string) => {
    driverSockets.set(driverId, socket.id);
    console.log(`🚗 Driver connected: ${driverId}`);
    const driver = await DriverModel.findById(driverId);

    // 1️⃣ Mark as online
    driverStore.upsert(driverId, { socketId: socket.id, status: "online", fcmToken: driver?.fcmToken });

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
                        lat,
                        lon,
                        timestamp: Date.now(),
                    });
                }
            }
        }
        console.log(`📍 Driver ${driverId} location updated: ${lat}, ${lon}`);
    });

    // 3️⃣ Handle driver availability
    socket.on("driver_online", () => {
        driverStore.upsert(driverId, { status: "online" });
    });

    socket.on("driver_offline", () => {
        driverStore.upsert(driverId, { status: "offline" });
    });

    socket.on("accept_ride", async ({ rideId }) => {
        console.log(`📩 Driver ${driverId} accepting ride ${rideId}`);

        const ride = await RideModel.findById(rideId);
        if (!ride) return socket.emit("error", { message: "Ride not found" });

        if (["pending", "offered"].includes(ride.status)) {
            ride.driverId = driverId;
            ride.status = "accepted";
            await ride.save();
            const driverSession = driverStore.get(driverId);
            driverStore.upsert(driverId, { currentRideId: ride._id });
            const driver = await DriverModel.findByIdAndUpdate(driverId, { currentRideId: rideId });

            socket.emit("ride_status", { status: "accepted", rideId });

            const userSocketId = userSockets.get(ride.userChatId);
            if (userSocketId) {
                socketIo.to(userSocketId).emit("ride_assigned", {
                    rideId: ride.id,
                    driver,
                    location: driverSession?.location,
                    message: "🚗 Your driver is on the way!",
                });
            }
        }
    });


    socket.on("fcm_token_update", async (token) => {
        driverStore.upsert(driverId, { fcmToken: token });
    });

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

    socket.on("ride_started", async (rideId) => {
        const ride = await updateRideStatus(rideId, "started");
        if (ride) emitToUser(ride.userChatId, "ride_started", {});
    });

    socket.on("ride_completed", async (rideId) => {
        const ride = await updateRideStatus(rideId, "completed");
        driverStore.upsert(driverId, { currentRideId: null });

        if (ride && ride.driverId) {
            await RideModel.findOneAndUpdate({ _id: ride.id }, { endedAt: new Date() });
            await DriverModel.findOneAndUpdate({ _id: ride.driverId }, { currentRideId: null });
            // ✅ Deduct commission and update driver balance
            const { balance, fare, commission } = await handleRideCommission(
                ride.driverId,
                rideId
            );

            // 🔔 Notify driver
            socket.emit("balance_updated", {
                newBalance: balance,
                fare,
                commission,
                message: `💰 Ride completed! You earned ${balance.toFixed(
                    0
                )} UZS after 12% commission.`,
            });

            emitToUser(ride.userChatId, "ride_completed", {})
        };
    });

    socket.on("disconnect", () => {
        driverSockets.delete(driverId);
        console.log(`❌ Driver disconnected: ${driverId}`);
    });
};
