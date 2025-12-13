// rideSearchManager.ts
export const RideSearchManager = {
    stopFlags: new Map<string, boolean>(),
    intervals: new Map<string, NodeJS.Timeout>(),

    stopSearch(rideId: string) {
        this.stopFlags.set(rideId, true);

        const interval = this.intervals.get(rideId);
        if (interval) clearInterval(interval);

        this.intervals.delete(rideId);
    },

    isStopped(rideId: string) {
        return this.stopFlags.get(rideId) === true;
    },

    startSearch(rideId: string, interval: NodeJS.Timeout) {
        this.stopFlags.set(rideId, false);
        this.intervals.set(rideId, interval);
    }
};
