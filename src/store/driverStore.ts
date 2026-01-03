import { DriverLocation } from "../types/location";
import { driverStoreRedis } from "./driverStoreRedis";
import { testDrivers } from "./testDrivers";

export interface DriverSession {
    driverId: string;
    socketId: string;
    status: "online" | "offline";
    socketStatus?: "connected" | "disconnected";
    currentRideId?: string | null;
    location?: DriverLocation;
    lastUpdated: number;
    fcmToken?: string;
    canReceiveOffers: boolean;
}

class DriverStore {
    private drivers: Map<string, DriverSession> = new Map();
    private activeOffers = new Set<string>();
    private maxStaleMs = 2 * 60 * 1000; // 2 minutes

    isAvailable(driverId: string): boolean {
        return !this.activeOffers.has(driverId);
    }

    markAsOffered(driverId: string) {
        this.activeOffers.add(driverId);
    }

    clearOffer(driverId: string) {
        this.activeOffers.delete(driverId);
    }

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
        const now = Date.now();
        return [...this.drivers.values()].filter(d =>
            d.status === "online" &&
            d.canReceiveOffers &&
            !d.currentRideId &&
            !this.activeOffers.has(d.driverId) &&
            d.lastUpdated + this.maxStaleMs >= now
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


    addTestDriversToStore(drivers: DriverSession[] = testDrivers) {
        console.log(`🧪 Adding ${drivers.length} test driver(s) to driverStore`);
        drivers.forEach(driver => {
            driverStoreRedis.upsert(driver.driverId, driver);
            console.log(`✅ Added test driver ${driver.driverId}`);
        });
    }
}

export const driverStore = new DriverStore();
