import { redis } from "../../redis/redisClient";

export function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // Earth's radius in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) *
        Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km
    return distance;
}

function deg2rad(deg: number) {
    return deg * (Math.PI / 180);
}

// export function sleep(ms: number) {
//     return new Promise(resolve => setTimeout(resolve, ms));
// }


export function sleep(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, ms);
        if (signal) {
            signal.addEventListener("abort", () => {
                clearTimeout(timeout);
                reject(new Error("Aborted"));
            });
        }
    });
}


export async function sleepOrAccepted(
    acceptKey: string,
    ms: number
): Promise<boolean> {
    const start = Date.now();

    while (Date.now() - start < ms) {
        if (await redis.exists(acceptKey)) {
            return true; // accepted
        }
        await sleep(200); // fast wake-up
    }

    return false; // timeout
}
