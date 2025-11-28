import { Schema, model, Document, Types } from "mongoose";

export interface ITransaction extends Document {
    rideId: Types.ObjectId;
    fromUserId: Types.ObjectId;  // who paid
    toUserId: Types.ObjectId;    // who received
    amount: number;
    createdAt: Date;
    type: "passenger_to_driver" | "driver_to_passenger"; // optional
}

const transactionSchema = new Schema<ITransaction>(
    {
        rideId: { type: Schema.Types.ObjectId, ref: "Ride", required: true },
        fromUserId: { type: Schema.Types.ObjectId, required: true, refPath: "fromModel" },
        toUserId: { type: Schema.Types.ObjectId, required: true, refPath: "toModel" },
        amount: { type: Number, required: true },
        type: { type: String, enum: ["passenger_to_driver", "driver_to_passenger"], required: true },
    },
    { timestamps: true }
);

export const TransactionModel = model<ITransaction>("Transaction", transactionSchema);
