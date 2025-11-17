export interface IWebsocketGateway {
    notifyUser(userId: string, event: string, payload: any): void;
    broadcastToRide(rideId: string, event: string, payload: any): void;
}
