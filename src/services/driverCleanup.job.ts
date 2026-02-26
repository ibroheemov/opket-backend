// driverCleanup.job.ts

import { driverStoreRedis } from "../store/driverStoreRedis";


const CLEANUP_INTERVAL_MS = 60 * 1000; // every 1 minute

export function startDriverCleanupJob() {
    setInterval(async () => {
        try {
            console.log("🧹 Running stale driver cleanup...");
            await driverStoreRedis.cleanupStaleDrivers();
        } catch (err) {
            console.error("Cleanup failed:", err);
        }
    }, CLEANUP_INTERVAL_MS);
}