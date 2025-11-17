import { IRideRepo } from "../../interfaces/repos/IRideRepo";
import { Ride } from "../../domain/entites/Ride";

export class InMemoryRideRepo implements IRideRepo {
    private rides = new Map<string, Ride>();

    async create(ride: Ride) { this.rides.set(ride.id, ride); }
    async getById(id: string) { return this.rides.get(id) ?? null; }
    async save(ride: Ride) { this.rides.set(ride.id, ride); }
    async findActiveByUser(userId: string) {
        for (const r of this.rides.values()) {
            if (r.userId === userId && !["completed", "cancelled"].includes(r.status)) return r;
        }
        return null;
    }
}
