import { redisSub } from "../redis/redisClient";
import { RideService } from "./ride.new.service";

// rideEvents.ts (import this once on server start)

redisSub.subscribe("ride.accepted", (message) => {
    const { rideId } = JSON.parse(message);
    console.log(`📣 Ride accepted event for ${rideId}`);
    RideService.stopSearching(rideId);
});

redisSub.subscribe("ride.cancelled", (message) => {
    const { rideId } = JSON.parse(message);
    RideService.stopSearching(rideId);
});
