import { Ride } from "../domain/entites/Ride";
import { IDriverRepo } from "../interfaces/repos/IDriverRepo";
import { IRideRepo } from "../interfaces/repos/IRideRepo";
import { IWebsocketGateway } from "../interfaces/websocket/IWebsocketGateway";

export class UpdateDriverLocation {
    constructor(
        private driverRepo: IDriverRepo,
        private rideRepo: IRideRepo,
        private ws: IWebsocketGateway
    ) { }

    async execute(driverId: string, location: { lat: number; lon: number }) {
        const driver = await this.driverRepo.getById(driverId);
        if (!driver) throw new Error("Driver not found");

        driver.location = location;
        await this.driverRepo.save(driver);

        // Get rides and broadcast updates to users if this driver is assigned
        const rides = await this.getAllRides();

        for (const rideCandidate of rides) {
            if (
                rideCandidate.driverId === driverId &&
                !["completed", "cancelled"].includes(rideCandidate.status)
            ) {
                this.ws.broadcastToRide(rideCandidate.id, "driver_location", {
                    driverId,
                    location,
                });
            }
        }
    }

    /**
     * Helper (naive) to fetch all rides.
     * In a real repo, you'd add `listAll()` to IRideRepo.
     */
    private async getAllRides(): Promise<Ride[]> {
        const anyRepo = this.rideRepo as any;

        // Defensive check: if it's an in-memory repo with .rides Map
        if (anyRepo?.rides instanceof Map) {
            const rides = Array.from(anyRepo.rides.values());
            // ensure proper typing
            return rides as Ride[];
        }

        // fallback — empty list if not supported
        return [];
    }
}