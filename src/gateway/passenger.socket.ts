import { Socket } from "socket.io";
import { PassengerModel } from "../models/PassengerModel";
import { socketIo, userSockets } from "./socket.maps";
import { passengerStore } from "../store/passengerStore";
import { emit } from "process";
import { emitToDriver, emitToUser } from "./ride.socket";

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

    console.log("🟢 [PASSENGER-MOBILE] connected")

    socket.on("ride_started_ack", async ({ eventId }) => {
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

    socket.on("disconnect", () => {
        passengerStore.remove(phone);
        console.log("🟢🔴 [PASSENGER-MOBILE] disconnected")
    });

    const passenger_in_store = passengerStore.get(phone);

    if (passenger.events.length != 0 && passenger_in_store) {
        for (const event of passenger.events) {
            await emitToUser(phone, event.event, event.data);
        }
    }
};


