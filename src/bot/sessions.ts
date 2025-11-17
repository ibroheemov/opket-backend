export interface DriverSessionOld {
    phone?: string;
    token?: string;
    status?: "online" | "offline";
    currentRideId?: string;
    messagesToDelete: number[],
}

export const driverSessions: Record<number, DriverSessionOld> = {};
