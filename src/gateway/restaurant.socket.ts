import { RestaurantSocketConnectionPayload } from "../bot/socket/types";
import { restaurantSockets } from "./socket.maps";


export const registerRestaurantHandlers = async ({ socket, restaurantId }: RestaurantSocketConnectionPayload) => {
    restaurantSockets.set(restaurantId, socket.id);

    console.log("Restaurant connected", restaurantId);
}