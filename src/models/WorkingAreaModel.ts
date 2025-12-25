import { Schema, model, Document } from 'mongoose';

export interface WorkingAreaDocument extends Document {
    name: string;
    polygon: { lat: number; lng: number }[];
    fareMultiplierOutside: number;
}

const PointSchema = new Schema(
    {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
    },
    { _id: false }
);

const WorkingAreaSchema = new Schema<WorkingAreaDocument>(
    {
        name: { type: String, required: true },
        polygon: { type: [PointSchema], required: true },
        fareMultiplierOutside: { type: Number, default: 2 },
    },
    { timestamps: true }
);

export const WorkingAreaModel = model<WorkingAreaDocument>(
    'WorkingArea',
    WorkingAreaSchema
);
