import { DriverLocation } from "../types/location";

export interface DriverSession {
    driverId: string;
    socketId: string;
    status: "online" | "offline";
    currentRideId?: string | null;
    location?: DriverLocation;
    lastUpdated: number;
    fcmToken?: string;
    canReceiveOffers: boolean;
}

class DriverStore {
    private drivers: Map<string, DriverSession> = new Map();

    // Add or update driver
    upsert(driverId: string, data: Partial<DriverSession>) {
        const existing = this.drivers.get(driverId);
        const updated: DriverSession = {
            ...existing,
            driverId,
            ...data,
            lastUpdated: Date.now(),
        } as DriverSession;
        this.drivers.set(driverId, updated);
    }

    // Get a driver session
    get(driverId: string): DriverSession | undefined {
        return this.drivers.get(driverId);
    }

    // Remove driver on disconnect
    remove(driverId: string) {
        this.drivers.delete(driverId);
    }

    // Find all online drivers (optionally filter by distance later)
    getOnlineDrivers(): DriverSession[] {
        console.log(this.drivers);

        return [...this.drivers.values()].filter(d =>
            d.status === "online" &&
            d.canReceiveOffers &&
            !d.currentRideId
        );
    }

    // Update live location
    updateLocation(driverId: string, location: DriverLocation) {
        const driver = this.drivers.get(driverId);
        if (driver) {
            driver.location = location;
            driver.lastUpdated = Date.now();
        }
    }

    // Clear stale drivers if needed (optional cleanup)
    cleanupStaleDrivers(ttlMs = 1000 * 60 * 5) {
        const now = Date.now();
        for (const [id, driver] of this.drivers.entries()) {
            if (now - driver.lastUpdated > ttlMs) {
                this.drivers.delete(id);
            }
        }
    }
}

export const driverStore = new DriverStore();
