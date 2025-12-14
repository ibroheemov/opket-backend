import { Schema, model } from 'mongoose';

const CoordinateSchema = new Schema({
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
});

const WorkingAreaSchema = new Schema({
    name: { type: String, required: true },
    polygon: { type: [CoordinateSchema], required: true },
    fareMultiplierOutside: { type: Number, default: 2 },
});

export const WorkingAreaModel = model('WorkingArea', WorkingAreaSchema);
