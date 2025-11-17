import { IDriverRepo } from "../../interfaces/repos/IDriverRepo";
import { Driver } from "../../domain/entites/Driver";
import { Location } from "../../domain/valueObjects/Location";

export class InMemoryDriverRepo implements IDriverRepo {
    private drivers: Map<string, Driver> = new Map();

    constructor(initial: Driver[] = []) {
        for (const d of initial) this.drivers.set(d.id, d);
    }

    async findNearest(location: Location): Promise<Driver | null> {
        // naive: Euclidean distance, only available drivers
        let best: Driver | null = null;
        let bestDist = Infinity;
        for (const d of this.drivers.values()) {
            if (d.status !== "available") continue;
            const dx = d.location.lat - location.lat;
            const dy = d.location.lon - location.lon;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < bestDist) { bestDist = dist; best = d; }
        }
        return best;
    }

    async getById(id: string) { return this.drivers.get(id) ?? null; }
    async save(driver: Driver) { this.drivers.set(driver.id, driver); }
}
