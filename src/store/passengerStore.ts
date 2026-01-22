import { DriverLocation } from "../types/location";
import { testDrivers } from "./testDrivers";

export interface PassengerSession {
    phone: number;
    socketId: string;
    status: "online" | "offline";
    currentRideId?: string | null;
    lastUpdated: number;

    // NEW: store missed events in memory
    pendingEvents?: Array<{
        event: string;
        data: any;
        createdAt: number;
    }>;
}


class PassengerStore {
    private passengers: Map<number, PassengerSession> = new Map();
    private activeOffers = new Set<number>();

    upsert(phone: number, data: Partial<PassengerSession>) {
        const existing = this.passengers.get(phone);

        const updated: PassengerSession = {
            ...existing,
            phone,
            ...data,
            pendingEvents: existing?.pendingEvents ?? [],
            lastUpdated: Date.now(),
        } as PassengerSession;

        this.passengers.set(phone, updated);
    }

    get(phone: number): PassengerSession | undefined {
        return this.passengers.get(phone);
    }

    // NEW: push missed event into passenger memory
    pushPendingEvent(phone: number, event: string, data: any) {
        const existing = this.passengers.get(phone);

        // if passenger doesn't exist yet, create a minimal session
        const updated: PassengerSession = {
            phone,
            socketId: existing?.socketId ?? "",
            status: existing?.status ?? "offline",
            currentRideId: existing?.currentRideId ?? null,
            lastUpdated: Date.now(),
            pendingEvents: [
                ...(existing?.pendingEvents ?? []),
                { event, data, createdAt: Date.now() },
            ],
        };

        this.passengers.set(phone, updated);
    }

    // NEW: pop & clear all pending events (use when passenger reconnects)
    flushPendingEvents(phone: number) {
        const existing = this.passengers.get(phone);
        if (!existing?.pendingEvents?.length) return [];

        const events = [...existing.pendingEvents];
        existing.pendingEvents = [];
        existing.lastUpdated = Date.now();
        this.passengers.set(phone, existing);

        return events;
    }

    isOnline(phone: number): boolean {
        const passenger = this.passengers.get(phone);
        return !!passenger && passenger.status === "online" && !!passenger.socketId;
    }
}


export const passengerStore = new PassengerStore();
