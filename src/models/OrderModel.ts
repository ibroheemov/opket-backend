import mongoose, { Schema, Document, Types } from "mongoose";

/** Client sends: { menuItemId: string, quantity: number } */
export interface MenuItemType {
    menuItemId: string;
    quantity: number;
}

export interface OrderItem {
    menuItemId: Types.ObjectId;

    name: string;      // snapshot
    price: number;     // price per item (cents)

    quantity: number;

    subtotal: number;  // price * quantity
}

export interface OrderPricing {
    itemsSubtotal: number;

    deliveryFee: number;
    serviceFee: number;
    tax: number;

    discount: number;

    total: number;
}

export type OrderStatus =
    | "PLACED"
    | "ACCEPTED_BY_RESTAURANT"
    | "PREPARING"
    | "READY_FOR_PICKUP"
    | "PICKED_UP"
    | "ON_THE_WAY"
    | "DELIVERED"
    | "CANCELLED_BY_CONSUMER"
    | "CANCELLED_BY_RESTAURANT"
    | "CANCELLED_NO_COURIER";

export type ServiceType = "DINE_IN" | "DELIVERY" | "TAKEAWAY";

export interface OrderModelDoc extends Document {

    restaurantId: Types.ObjectId;
    courierId?: Types.ObjectId | null;
    consumerId: Types.ObjectId;
    consumerPhone: number;
    serviceType: ServiceType;

    items: OrderItem[];

    pricing: OrderPricing;

    orderNumber: number;
    orderDate: string;

    dropoff: { latitude: number; longitude: number };
    pickup: { latitude: number; longitude: number };

    status: OrderStatus;

    statusHistory: Array<{
        status: OrderStatus;
        at: Date;
        by?: Types.ObjectId;
        note?: string;
    }>;

    cancelReason?: string;

    isActive: boolean;
}

const latLonSchema = new Schema(
    {
        latitude: { type: Number, required: true, min: -90, max: 90 },
        longitude: { type: Number, required: true, min: -180, max: 180 },
    },
    { _id: false }
);

const orderItemSchema = new Schema(
    {
        menuItemId: { type: Schema.Types.ObjectId, required: true, ref: "MenuItem" },

        name: { type: String, required: true },

        price: { type: Number, required: true, min: 0 },

        quantity: { type: Number, required: true, min: 1, max: 999 },

        subtotal: { type: Number, required: true, min: 0 }
    },
    { _id: false }
);

const pricingSchema = new Schema(
    {
        itemsSubtotal: { type: Number, required: true, min: 0 },

        deliveryFee: { type: Number, required: true, default: 0 },
        serviceFee: { type: Number, required: true, default: 0 },
        tax: { type: Number, required: true, default: 0 },

        discount: { type: Number, required: true, default: 0 },

        total: { type: Number, required: true, min: 0 }
    },
    { _id: false }
);

const statusHistorySchema = new Schema(
    {
        status: {
            type: String,
            required: true,
            enum: [
                "PLACED",
                "ACCEPTED_BY_RESTAURANT",
                "PREPARING",
                "READY_FOR_PICKUP",
                "PICKED_UP",
                "ON_THE_WAY",
                "DELIVERED",
                "CANCELLED_BY_CONSUMER",
                "CANCELLED_BY_RESTAURANT",
                "CANCELLED_NO_COURIER",
            ],
        },
        at: { type: Date, required: true, default: Date.now },
        by: { type: Schema.Types.ObjectId, required: false },
        note: { type: String, required: false, maxlength: 500 },
    },
    { _id: false }
);

const orderSchema = new Schema<OrderModelDoc>(
    {
        restaurantId: { type: Schema.Types.ObjectId, required: true, ref: "Restaurant", index: true },
        courierId: { type: Schema.Types.ObjectId, required: false, ref: "Driver", default: null, index: true },
        consumerId: { type: Schema.Types.ObjectId, required: true, ref: "User", index: true },
        consumerPhone: { type: Number, required: true },
        serviceType: {
            type: String,
            required: true,
            default: "DELIVERY",
            enum: ["DINE_IN", "DELIVERY", "TAKEAWAY"],
            index: true,
        },

        items: {
            type: [orderItemSchema],
            required: true,
            validate: [(v: any[]) => v.length > 0, "Items cannot be empty"]
        },

        dropoff: { type: latLonSchema, required: true },
        pickup: { type: latLonSchema, required: true },

        orderNumber: { type: Number, required: true },
        pricing: { type: pricingSchema, required: true },
        orderDate: { type: String, required: true, index: true },

        status: {
            type: String,
            required: true,
            default: "PLACED",
            enum: [
                "PLACED",
                "ACCEPTED_BY_RESTAURANT",
                "PREPARING",
                "READY_FOR_PICKUP",
                "PICKED_UP",
                "ON_THE_WAY",
                "DELIVERED",
                "CANCELLED_BY_CONSUMER",
                "CANCELLED_BY_RESTAURANT",
                "CANCELLED_NO_COURIER",
            ],
            index: true,
        },

        statusHistory: { type: [statusHistorySchema], required: true, default: [] },

        cancelReason: { type: String, required: false, maxlength: 300 },

        isActive: { type: Boolean, required: true, default: true, index: true },
    },
    { timestamps: true }
);

orderSchema.index({ restaurantId: 1, createdAt: -1 });
orderSchema.index({ consumerId: 1, createdAt: -1 });
orderSchema.index({ courierId: 1, status: 1 });
orderSchema.index({ status: 1 });

// Keep isActive in sync (simple rule)
orderSchema.pre("save", function (next) {
    const terminal = new Set<OrderStatus>([
        "DELIVERED",
        "CANCELLED_BY_CONSUMER",
        "CANCELLED_BY_RESTAURANT",
        "CANCELLED_NO_COURIER",
    ]);
    this.isActive = !terminal.has(this.status);
    next();
});

export const OrderModel = mongoose.model<OrderModelDoc>("Order", orderSchema);