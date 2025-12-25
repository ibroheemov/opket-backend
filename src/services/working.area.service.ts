import { WorkingArea } from "../models/WorkingArea";
import { WorkingAreaDocument, WorkingAreaModel } from "../models/WorkingAreaModel";

export class WorkingAreaService {
    async getAll(): Promise<WorkingArea[]> {
        return await WorkingAreaModel.find().lean<WorkingArea[]>();
    }
}
