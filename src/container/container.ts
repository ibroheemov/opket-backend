import WebSocket from "ws";
import { InMemoryDriverRepo } from "../infra/repos/InMemoryDriverRepo";
import { InMemoryRideRepo } from "../infra/repos/InMemoryRideRepo";
import { WsGateway } from "../infra/websocket/WsGateway";
import { RequestRide } from "../usecases/RequestRide";
import { ConfirmRide } from "../usecases/ConfirmRide";
import { UpdateDriverLocation } from "../usecases/UpdateDriverLocation";
import { Driver } from "../domain/entites/Driver";

export function buildContainer(wss: WebSocket.Server) {
    // seed drivers
    const drivers = [
        new Driver("d1", "Alice", "992707255", "Toyota Prius", "offline", { lat: 41.3275, lon: 69.2811 }),
        new Driver("d2", "Bob", "992707455", "Honda Civic", "available", { lat: 41.3300, lon: 69.2800 }),
    ];

    const driverRepo = new InMemoryDriverRepo(drivers);
    const rideRepo = new InMemoryRideRepo();
    const wsGateway = new WsGateway(wss);

    const requestRide = new RequestRide(rideRepo, driverRepo, wsGateway);
    const confirmRide = new ConfirmRide(rideRepo, driverRepo, wsGateway);
    const updateDriverLocation = new UpdateDriverLocation(driverRepo, rideRepo, wsGateway);

    return { driverRepo, rideRepo, wsGateway, requestRide, confirmRide, updateDriverLocation };
}
