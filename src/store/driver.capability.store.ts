import { redis } from "../redis/redisClient";

const CAPABILITY_PREFIX = "drivers:capability:";

export class DriverCapabilityStore {
    private key(service: string) {
        return `${CAPABILITY_PREFIX}${service}`;
    }

    async addDriver(driverId: string, services: string[]) {
        if (!services.length) return;

        const multi = redis.multi();

        for (const service of services) {
            multi.sAdd(this.key(service), driverId);
        }

        await multi.exec();
    }

    async removeDriver(driverId: string, services: string[]) {
        if (!services.length) return;

        const multi = redis.multi();

        for (const service of services) {
            multi.sRem(this.key(service), driverId);
        }

        await multi.exec();
    }

    // optional helper (useful later)
    async getDriversForServices(services: string[]): Promise<string[]> {
        if (!services.length) return [];

        return redis.sInter(
            services.map((s) => this.key(s))
        );
    }
}

export const driverCapabilityStore = new DriverCapabilityStore();