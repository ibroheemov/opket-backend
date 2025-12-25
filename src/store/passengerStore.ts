import { DriverLocation } from "../types/location";
import { testDrivers } from "./testDrivers";

export interface PassengerSession {
    phone: number;
    socketId: string;
    status: "online" | "offline";
    currentRideId?: string | null;
    lastUpdated: number;
}

class PassengerStore {
    private passengers: Map<number, PassengerSession> = new Map();
    private activeOffers = new Set<number>();

    isAvailable(phone: number): boolean {
        return !this.activeOffers.has(phone);
    }

    markAsOffered(phone: number) {
        this.activeOffers.add(phone);
    }

    clearOffer(phone: number) {
        this.activeOffers.delete(phone);
    }

    // Add or update passenger
    upsert(phone: number, data: Partial<PassengerSession>) {
        const existing = this.passengers.get(phone);
        const updated: PassengerSession = {
            ...existing,
            phone,
            ...data,
            lastUpdated: Date.now(),
        } as PassengerSession;
        this.passengers.set(phone, updated);
    }

    // Get a driver session
    get(phone: number): PassengerSession | undefined {
        return this.passengers.get(phone);
    }

    // Remove driver on disconnect
    remove(phone: number) {
        this.passengers.delete(phone);
    }

    // Clear stale passengers if needed (optional cleanup)
    cleanupStalePassengers(ttlMs = 1000 * 60 * 5) {
        const now = Date.now();
        for (const [id, driver] of this.passengers.entries()) {
            if (now - driver.lastUpdated > ttlMs) {
                this.passengers.delete(id);
            }
        }
    }

}

export const passengerStore = new PassengerStore();
