// rideSearchManager.ts
export class RideSearchManager {
    private controllers = new Map<string, AbortController>();

    start(
        rideId: string,
        run: (signal: AbortSignal) => Promise<void>,
        onDone?: () => void
    ) {
        // Defensive: if something exists, abort it and replace
        this.abort(rideId);

        const controller = new AbortController();
        this.controllers.set(rideId, controller);

        run(controller.signal)
            .catch((err) => {
                if (err?.message === "Aborted") return;
                console.error(`Search failed for ride ${rideId}:`, err);
            })
            .finally(() => {
                // avoid deleting a newer controller if restarted
                const current = this.controllers.get(rideId);
                if (current === controller) this.controllers.delete(rideId);
                onDone?.();
            });
    }

    abort(rideId: string) {
        const existing = this.controllers.get(rideId);
        if (existing) existing.abort();
        this.controllers.delete(rideId);
    }

    has(rideId: string) {
        return this.controllers.has(rideId);
    }
}
