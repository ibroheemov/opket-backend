import mongoose, { Schema, Document } from "mongoose";

export interface IPassengerDocument extends Document {
    _id: string,
    chatId: number;
    balance: number;
    currentRideId?: string;
}

const PassengerSchema = new Schema<IPassengerDocument>(
    {
        chatId: { type: Number, required: true },
        balance: { type: Number, default: 0 },
        currentRideId: { type: String },
    },
    { timestamps: true }
);

export const PassengerModel = mongoose.model<IPassengerDocument>(
    "Passenger",
    PassengerSchema
);
