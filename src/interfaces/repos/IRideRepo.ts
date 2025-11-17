import { Ride } from "../../domain/entites/Ride";

export interface IRideRepo {
    create(ride: Ride): Promise<void>;
    getById(id: string): Promise<Ride | null>;
    save(ride: Ride): Promise<void>;
    findActiveByUser(userId: string): Promise<Ride | null>;
}
