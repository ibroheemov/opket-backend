import mongoose, { Schema, Document } from "mongoose";

export interface IPassengerDocument extends Document {
    _id: string,
    chatId: number;
    phone: number;
    balance: number;
    currentRideId?: string;
    fcmToken?: string;
    verified?: boolean;
    events: {
        event: string;
        data: Record<string, any>;
    }[];
}

const PassengerSchema = new Schema<IPassengerDocument>(
    {
        chatId: { type: Number },
        phone: { type: Number },
        fcmToken: { type: String, required: false },
        balance: { type: Number, default: 0 },
        currentRideId: { type: String },
        verified: { type: Boolean, default: true },
        events: {
            type: [
                {
                    event: { type: String, required: true },
                    data: { type: Schema.Types.Mixed, required: true }
                }
            ],
            default: []
        }
    },
    { timestamps: true }
);

export const PassengerModel = mongoose.model<IPassengerDocument>(
    "Passenger",
    PassengerSchema
);
