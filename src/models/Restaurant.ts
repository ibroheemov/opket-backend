import mongoose, { Schema, Document, Types } from "mongoose";

export type GeoPoint = {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
};

export type RestaurantStatus = "ACTIVE" | "SUSPENDED" | "DELETED";
export type PriceTier = 1 | 2 | 3 | 4; // $..$$$$
export type FulfillmentMode = "DELIVERY" | "PICKUP";
export type PaymentMethod = "CASH" | "CARD" | "WALLET";

export interface IRestaurant extends Document {
    // Ownership / identity
    ownerUserId: Types.ObjectId; // restaurant admin account lives in User collection
    status: RestaurantStatus;

    // Public profile
    name: string;
    description?: string;
    phone: string;
    fcmToken?: string;

    // Address
    address: {
        line1: string;
        line2?: string;
        city: string;
        region: string;
        postalCode?: string;
        country?: string;
    };

    // Location (GeoJSON for geospatial queries)
    location?: GeoPoint;

    // Media
    logo_url?: string | null;
    logo_public_id?: string | null;
    banner_url?: string | null;
    banner_public_id?: string | null;
    gallery_urls?: string[];

    // Marketplace attributes
    cuisine_types: string[]; // ["Italian", "Pizza", "Halal"]
    tags?: string[]; // ["Vegan-friendly", "Family meals"]
    price_tier?: PriceTier;

    // Availability / ordering
    is_open: boolean; // current open/closed (can be computed by hours too)
    accepting_orders: boolean; // can be turned off when overloaded
    temporarily_closed_reason?: string;

    hours_json?: any; // keep flexible; consider replacing with structured schedule later
    timezone?: string; // e.g. "Asia/Tashkent"

    fulfillment_modes: FulfillmentMode[]; // ["DELIVERY", "PICKUP"]
    payment_methods: PaymentMethod[]; // ["CASH","CARD","WALLET"]
    supports_scheduled_orders: boolean;
    auto_accept_orders: boolean;

    // Operational settings (delivery + prep)
    prep_time_min: number; // typical prep time
    prep_time_max: number;

    min_order_amount: number; // in minor units if you prefer (see currency section)
    delivery: {
        radius_km: number; // service radius
        fee_base: number;
        fee_per_km?: number;
        fee_min?: number;
        fee_max?: number;
        free_over_amount?: number;
    };

    // Financials / settlement
    currency: string; // "UZS", "USD", etc.
    commission_percent: number; // marketplace commission
    payout: {
        enabled: boolean;
        bank_name?: string;
        account_last4?: string;
        account_holder?: string;
    };

    // Reputation
    rating_avg: number;
    rating_count: number;

    // Performance (optional but useful for ranking)
    metrics: {
        active_orders_count: number; // denormalized
        last_order_at?: Date;
        avg_ready_time_min?: number;
    };

    cuisineTypeId: Types.ObjectId;

    // Timestamps
    createdAt: Date;
    updatedAt: Date;
}

const geoPointSchema = new Schema<GeoPoint>(
    {
        type: { type: String, enum: ["Point"], required: true, default: "Point" },
        coordinates: {
            type: [Number],
            required: true,
            validate: {
                validator: (v: number[]) =>
                    Array.isArray(v) &&
                    v.length === 2 &&
                    Number.isFinite(v[0]) &&
                    Number.isFinite(v[1]) &&
                    v[0] >= -180 &&
                    v[0] <= 180 &&
                    v[1] >= -90 &&
                    v[1] <= 90,
                message: "Invalid coordinates. Expected [lng, lat].",
            },
        },
    },
    { _id: false }
);

const restaurantSchema = new Schema<IRestaurant>(
    {
        ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        status: { type: String, enum: ["ACTIVE", "SUSPENDED", "DELETED"], default: "ACTIVE", index: true },

        name: { type: String, required: true, trim: true, index: true },
        description: { type: String, maxlength: 2000, default: null },
        phone: { type: String, required: true, trim: true },
        fcmToken: { type: String },

        address: {
            line1: { type: String, required: true, trim: true },
            line2: { type: String, default: null, trim: true },
            city: { type: String, required: true, trim: true, index: true },
            region: { type: String, required: true, trim: true, index: true },
            postalCode: { type: String, default: null, trim: true },
            country: { type: String, default: null, trim: true },
        },

        location: { type: geoPointSchema, default: null },

        logo_url: { type: String, default: null },
        logo_public_id: { type: String, default: null },
        banner_url: { type: String, default: null },
        banner_public_id: { type: String, default: null },
        gallery_urls: { type: [String], default: [] },

        cuisine_types: { type: [String], default: [], index: true },
        tags: { type: [String], default: [] },
        price_tier: { type: Number, enum: [1, 2, 3, 4], default: null },

        is_open: { type: Boolean, default: true, index: true },
        accepting_orders: { type: Boolean, default: true, index: true },
        temporarily_closed_reason: { type: String, default: null, maxlength: 300 },

        hours_json: { type: Schema.Types.Mixed, default: null },
        timezone: { type: String, default: null },

        fulfillment_modes: {
            type: [String],
            enum: ["DELIVERY", "PICKUP"],
            default: ["DELIVERY"],
        },
        payment_methods: {
            type: [String],
            enum: ["CASH", "CARD", "WALLET"],
            default: ["CASH"],
        },
        supports_scheduled_orders: { type: Boolean, default: false },
        auto_accept_orders: { type: Boolean, default: false },

        prep_time_min: { type: Number, default: 15, min: 1 },
        prep_time_max: { type: Number, default: 45, min: 1 },

        min_order_amount: { type: Number, default: 0, min: 0 },
        delivery: {
            radius_km: { type: Number, default: 8, min: 0 },
            fee_base: { type: Number, default: 0, min: 0 },
            fee_per_km: { type: Number, default: null, min: 0 },
            fee_min: { type: Number, default: null, min: 0 },
            fee_max: { type: Number, default: null, min: 0 },
            free_over_amount: { type: Number, default: null, min: 0 },
        },

        currency: { type: String, default: "UZS", trim: true },
        commission_percent: { type: Number, default: 0, min: 0, max: 100 },
        payout: {
            enabled: { type: Boolean, default: false },
            bank_name: { type: String, default: null },
            account_last4: { type: String, default: null },
            account_holder: { type: String, default: null },
        },

        rating_avg: { type: Number, default: 0, min: 0, max: 5, index: true },
        rating_count: { type: Number, default: 0, min: 0 },

        cuisineTypeId: { type: Schema.Types.ObjectId, ref: "RestaurantType", index: true },

        metrics: {
            active_orders_count: { type: Number, default: 0, min: 0 },
            last_order_at: { type: Date, default: null },
            avg_ready_time_min: { type: Number, default: null, min: 0 },
        },
    },
    { timestamps: true }
);

// Geospatial index for "restaurants near me"
restaurantSchema.index({ location: "2dsphere" });

// Helpful compound indexes for marketplace queries
restaurantSchema.index({ status: 1, is_open: 1, accepting_orders: 1 });
restaurantSchema.index({ "address.city": 1, "address.region": 1 });

// Text search (name + city + cuisine)
restaurantSchema.index({
    name: "text",
    "address.city": "text",
    "address.region": "text",
    cuisine_types: "text",
    tags: "text",
});

// Optional: keep legacy lat/lng in sync if you still store them elsewhere (not included here)

export const RestaurantModel = mongoose.model<IRestaurant>("Restaurant", restaurantSchema);