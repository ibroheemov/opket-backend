import { Request, Response } from "express";
import {
    CancellationReasonModel,
    ensureCancelReasonsSeeded,
} from "../models/CancellationReasonModel";

/**
 * GET /ride/cancel-reasons
 * Public endpoint consumed by the passenger app to render the cancellation
 * reason bottom sheet. Only active reasons are returned, ordered by `order`.
 */
export const listCancelReasons = async (_req: Request, res: Response) => {
    try {
        await ensureCancelReasonsSeeded();
        const reasons = await CancellationReasonModel.find({ active: true })
            .sort({ order: 1, createdAt: 1 })
            .select("key labelUz order")
            .lean();
        return res.json({ reasons });
    } catch (err: any) {
        return res.status(500).json({
            error: err?.message ?? "Failed to load cancellation reasons",
        });
    }
};

/**
 * Increments the count for a given reason key. Returns silently on unknown
 * keys so a stale client can never break the cancel flow.
 */
export async function incrementCancelReason(reasonKey: string | undefined) {
    if (!reasonKey || typeof reasonKey !== "string") return;
    try {
        await CancellationReasonModel.findOneAndUpdate(
            { key: reasonKey },
            { $inc: { count: 1 } }
        );
    } catch (err) {
        console.error("incrementCancelReason error:", err);
    }
}

/** Returns the Uzbek label for a reason key, or null if not found. */
export async function getCancelReasonLabel(reasonKey: string): Promise<string | null> {
    try {
        const doc = await CancellationReasonModel.findOne({ key: reasonKey }).select("labelUz").lean();
        return doc?.labelUz ?? null;
    } catch {
        return null;
    }
}
