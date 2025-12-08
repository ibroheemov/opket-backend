import mongoose, { Schema, Document } from "mongoose";

export type TransactionStatus = "CREATED" | "CANCELLED";

export interface TransactionDocument extends Document {
    transactionId: number;
    serviceId?: number;
    phone: string;
    amount: number;
    status: TransactionStatus;
    createdAt: Date;
    updatedAt: Date;
}

export const TransactionSchema = new Schema<TransactionDocument>(
    {
        transactionId: { type: Number, required: true, unique: true },
        serviceId: { type: Number, default: null },
        phone: { type: String, required: true },
        amount: { type: Number, required: true },
        status: {
            type: String,
            required: true,
            enum: ["CREATED", "CANCELLED"],
            default: "CREATED"
        }
    },
    { timestamps: true }
);

export const PaynetTransactionModel = mongoose.model<TransactionDocument>("PaynetTransaction", TransactionSchema);