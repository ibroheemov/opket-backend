import { Driver } from "../../domain/entites/Driver";
import { Location } from "../../domain/valueObjects/Location";

export interface IDriverRepo {
    findNearest(location: Location): Promise<Driver | null>;
    getById(id: string): Promise<Driver | null>;
    save(driver: Driver): Promise<void>;
}
