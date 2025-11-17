import WebSocket from "ws";
import { IWebsocketGateway } from "../../interfaces/websocket/IWebsocketGateway";

/**
 * Simplified gateway:
 * - maps userId to ws
 * - maps rideId to list of user sockets subscribed
 */
export class WsGateway implements IWebsocketGateway {
    private userSockets = new Map<string, WebSocket>();
    private rideSubs = new Map<string, Set<string>>(); // rideId -> userIds

    constructor(private wss: WebSocket.Server) {
        wss.on("connection", (ws, req) => {
            // expect client to send {"type":"identify","userId":"..."} upon connection
            ws.on("message", (msg) => {
                try {
                    const data = JSON.parse(msg.toString());
                    if (data.type === "identify" && data.userId) {
                        this.userSockets.set(data.userId, ws);
                    }
                    if (data.type === "subscribeRide" && data.rideId && data.userId) {
                        const set = this.rideSubs.get(data.rideId) ?? new Set();
                        set.add(data.userId);
                        this.rideSubs.set(data.rideId, set);
                    }
                } catch { }
            });

            ws.on("close", () => {
                // remove from userSockets
                for (const [uid, s] of this.userSockets.entries()) {
                    if (s === ws) this.userSockets.delete(uid);
                }
            });
        });
    }

    notifyUser(userId: string, event: string, payload: any) {
        const ws = this.userSockets.get(userId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ event, payload }));
        }
    }

    broadcastToRide(rideId: string, event: string, payload: any) {
        const subs = this.rideSubs.get(rideId);
        if (!subs) return;
        for (const userId of subs) this.notifyUser(userId, event, payload);
    }
}
