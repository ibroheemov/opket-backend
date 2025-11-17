import { IRideRepo } from "../interfaces/repos/IRideRepo";
import { IDriverRepo } from "../interfaces/repos/IDriverRepo";
import { IWebsocketGateway } from "../interfaces/websocket/IWebsocketGateway";

export class ConfirmRide {
    constructor(
        private rideRepo: IRideRepo,
        private driverRepo: IDriverRepo,
        private ws: IWebsocketGateway
    ) { }

    async execute(rideId: string, driverId: string) {
        const ride = await this.rideRepo.getById(rideId);
        if (!ride) throw new Error("ride not found");
        const driver = await this.driverRepo.getById(driverId);
        if (!driver) throw new Error("driver not found");
        if (driver.status !== "available") throw new Error("driver not available");

        // assign
        ride.driverId = driver.id;
        ride.status = "confirmed";
        await this.rideRepo.save(ride);

        driver.status = "on_trip";
        await this.driverRepo.save(driver);

        // notify driver (in a real app you'd push to driver's app) and user
        this.ws.notifyUser(ride.userId, "ride_confirmed", { rideId, driver });
        this.ws.notifyUser(driver.id, "ride_assigned", { rideId, pickup: ride.pickup });
        return ride;
    }
}
