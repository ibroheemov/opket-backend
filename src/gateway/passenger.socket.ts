import { Socket } from "socket.io";
import { PassengerModel } from "../models/PassengerModel";
import { socketIo, userSockets } from "./socket.maps";
import { passengerStore } from "../store/passengerStore";
import { emit } from "process";
import { emitToDriver, emitToUser } from "./ride.socket";
import { driverStoreRedis } from "../store/driverStoreRedis";

export const registerPassengerHandlersMobile = async ({ socket, phone }: {
    socket: Socket;
    phone: number;
}) => {
    const passenger = await PassengerModel.findOne({ phone });

    if (!passenger) {
        console.error("🟢❌ PASSENGER => SOCKET CONNECTION - Passenger not found in DB:", phone);
        socket.emit("error", { message: "Passenger not found" });
        return; // stop socket setup
    }


    userSockets.set(phone, socket.id);
    // 1️⃣ Mark as online
    passengerStore.upsert(
        phone,
        {
            socketId: socket.id,
            status: "online",
        }
    );

    console.log("🟢 [PASSENGER-MOBILE] connected");
    emitMissedPassengerEvents(socket, phone);
    emitToUser(phone, "feature_flags", { 'isLuggageEnabled': false });

    socket.on("ride_started_ack", async ({ eventId }) => {
        await PassengerModel.updateOne(
            { phone },
            { $pull: { events: { event: eventId } } }
        );
    });

    socket.on("ride_started_ack", async ({ eventId }) => {
        await PassengerModel.updateOne(
            { phone },
            { $pull: { events: { event: eventId } } }
        );
    });


    socket.on("driver_arrived_ack", async ({ eventId }) => {
        await PassengerModel.updateOne(
            { phone },
            { $pull: { events: { event: eventId } } }
        );
    });

    socket.on("ride_accepted_ack", async ({ eventId }) => {
        await PassengerModel.updateOne(
            { phone },
            { $pull: { events: { event: eventId } } }
        );
    });

    socket.on("balance_deduction_request_ack", async ({ eventId }) => {
        await PassengerModel.updateOne(
            { phone },
            { $pull: { events: { event: eventId } } }
        );
    });

    socket.on("balance_top_up_ack", async ({ eventId }) => {
        await PassengerModel.updateOne(
            { phone },
            { $pull: { events: { event: eventId } } }
        );
    });

    socket.on("add_luggage_ack", async ({ eventId }) => {
        await PassengerModel.updateOne(
            { phone },
            { $pull: { events: { event: eventId } } }
        );
    });

    socket.on("ride_no_drivers_ack", async ({ eventId }) => {
        await PassengerModel.updateOne(
            { phone },
            { $pull: { events: { event: eventId } } }
        );
    });

    socket.on("ride_change_declined", async ({ driverId }) => {
        const sent = emitToDriver(driverId, 'ride_change_declined', {});
    });


    socket.on("premium_taxi", async ({ driverId }) => {
        const isAvailable = await driverStoreRedis.hasAvailablePremiumDriver();
        console.log("premium_taxi", isAvailable);
        emitToUser(phone, "no_premium_drivers", { isAvailable });
    });

    socket.on("luggage_confirmed", async ({ driverId }) => {
        console.log(`luggage_confirmed: ${driverId}`);

        const sent = await emitToDriver(driverId, 'luggage_confirmed', {});

        console.log(`luggage_confirmed: ${sent}`);
    });

    socket.on("luggage_declined", async ({ driverId }) => {
        const sent = emitToDriver(driverId, 'luggage_declined', {});

        console.log(`luggage_declined: ${sent}`);

    });

    socket.on("connect_error", (err) =>
        console.error("🟢❌ [PASSENGER-MOBILE] Connection error:", err.message)
    );

    socket.on("connect", () => {
        passengerStore.upsert(phone, { status: "online" })
        console.log("🟢 #1[PASSENGER] connected")
        emitMissedPassengerEvents(socket, phone);
    });

    socket.on("disconnect", () => {
        passengerStore.upsert(phone, { status: "offline" });
        console.log("🟢🔴 [PASSENGER-MOBILE] disconnected")
    });


};



export const emitMissedPassengerEvents = (socket: Socket, phone: number) => {
    const passenger = passengerStore.get(phone);
    if (!passenger) return;

    // If passenger has current ride -> flush only ride events
    if (passenger.currentRideId) {
        const missed = passengerStore.flushPendingEvents(phone);

        for (const e of missed) {
            socket.emit(e.event, e.data);
        }

        console.log(
            `♻️ [PASSENGER:${phone}] flushed ${missed.length} missed events for rideId=${passenger.currentRideId}`
        );
        return;
    }

    // If no current ride -> flush everything
    const missedAll = passengerStore.flushPendingEvents(phone);

    for (const e of missedAll) {
        socket.emit(e.event, e.data);
    }

    console.log(`♻️ [PASSENGER:${phone}] flushed ${missedAll.length} missed events (no active ride)`);
};
