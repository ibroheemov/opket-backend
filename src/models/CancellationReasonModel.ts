import mongoose, { Schema } from "mongoose";

const CancellationReasonSchema = new Schema(
    {
        key: { type: String, required: true, unique: true, index: true },
        labelUz: { type: String, required: true },
        count: { type: Number, default: 0, min: 0 },
        order: { type: Number, default: 0 },
        active: { type: Boolean, default: true },
    },
    { timestamps: true }
);

export const CancellationReasonModel = mongoose.model(
    "CancellationReason",
    CancellationReasonSchema
);

/**
 * Default reason set used to seed the collection the first time it is read.
 * Once seeded, admins manage the list from the panel.
 */
export const DEFAULT_CANCEL_REASONS: Array<{
    key: string;
    labelUz: string;
    order: number;
}> = [
    { key: "accidental", labelUz: "Men tasodifan bosib yubordim", order: 0 },
    { key: "plans_changed", labelUz: "Rejalar o'zgardi", order: 1 },
    { key: "waited_too_long", labelUz: "Uzoq kutdim", order: 2 },
    { key: "wrong_address", labelUz: "Manzil berishda xato qildim", order: 3 },
    { key: "driver_not_moving", labelUz: "Haydovchi joyidan jilmayapti", order: 4 },
    { key: "driver_unreachable", labelUz: "Haydovchi javob bermayapti", order: 5 },
    { key: "found_alternative", labelUz: "Boshqa transport topdim", order: 6 },
    { key: "other", labelUz: "Boshqa sabab", order: 7 },
];

/**
 * Seeds the default reason list if the collection is empty. Safe to call on
 * every list request — it short-circuits as soon as any reason exists.
 */
export async function ensureCancelReasonsSeeded() {
    const existing = await CancellationReasonModel.countDocuments();
    if (existing > 0) return;
    try {
        await CancellationReasonModel.insertMany(
            DEFAULT_CANCEL_REASONS.map((r) => ({ ...r, count: 0, active: true })),
            { ordered: false }
        );
    } catch (_) {
        // Concurrent seeders may race; ignore duplicate-key errors.
    }
}
