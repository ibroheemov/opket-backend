import { IRideRepo } from "../interfaces/repos/IRideRepo";
import { IDriverRepo } from "../interfaces/repos/IDriverRepo";
import { Ride } from "../domain/entites/Ride";
import { v4 as uuid } from "uuid";
import { IWebsocketGateway } from "../interfaces/websocket/IWebsocketGateway";

export class RequestRide {
    constructor(
        private rideRepo: IRideRepo,
        private driverRepo: IDriverRepo,
        private ws: IWebsocketGateway
    ) { }

    async execute(userId: string, pickup: { lat: number, lon: number }) {
        // 1. create ride (requested)
        const ride = new Ride(uuid(), userId, pickup);
        await this.rideRepo.create(ride);

        // 2. find nearest available driver
        const driver = await this.driverRepo.findNearest(pickup);
        if (!driver) {
            // notify user no drivers
            this.ws.notifyUser(userId, "no_drivers", { message: "No drivers nearby" });
            return { ride, driver: null };
        }

        // 3. send driver preview to user (eta, vehicle)
        // note: assignment only after confirmation
        return {
            ride, driver: {
                id: driver.id, name: driver.name, vehicle: driver.vehicle, eta: 3 // minutes (mock)
            }
        };
    }
}
