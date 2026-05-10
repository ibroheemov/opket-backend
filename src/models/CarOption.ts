import mongoose, { Schema, Document } from "mongoose";

export interface ICarOption extends Document {
    type: "car_model" | "car_color";
    value: string;
    sort_order: number;
}

const CarOptionSchema: Schema = new Schema(
    {
        type: {
            type: String,
            enum: ["car_model", "car_color"],
            required: true,
        },
        value: {
            type: String,
            required: true,
            trim: true,
        },
        sort_order: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

export default mongoose.model<ICarOption>("CarOption", CarOptionSchema);
