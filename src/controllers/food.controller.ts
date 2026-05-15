import { Types } from "mongoose";
import { OrderModel, OrderStatus } from "../models/OrderModel";
import { Request, Response } from "express";
import { FcmService } from "../services/fcm.service";

/** Adjust to your auth typings */
// type Request = Request & {
//     user?: { id: string; role?: "CONSUMER" | "COURIER" | "RESTAURANT" | "ADMIN" };
// };
const statusTranslation: Record<OrderStatus, string> = {
    PLACED: "Yuborildi",
    ACCEPTED_BY_RESTAURANT: "Restoran qabul qildi",
    PREPARING: "Tayyorlanmoqda",
    READY_FOR_PICKUP: "Olib ketishga tayyor",
    PICKED_UP: "Kuryer oldi",
    ON_THE_WAY: "Yetkazilmoqda",
    DELIVERED: "Yetkazildi",
    CANCELLED_BY_CONSUMER: "Mijoz bekor qildi",
    CANCELLED_BY_RESTAURANT: "Restoran bekor qildi",
    CANCELLED_NO_COURIER: "Kuryer topilmadi",
};

function isObjectId(id: string): boolean {
    return Types.ObjectId.isValid(id);
}

function toObjectId(id: string): Types.ObjectId {
    return new Types.ObjectId(id);
}

function bad(res: Response, code: number, message: string) {
    return res.status(code).json({ ok: false, message });
}

function ok(res: Response, data: any) {
    return res.json({ ok: true, data });
}

function pushHistory(params: {
    status: OrderStatus;
    by?: Types.ObjectId;
    note?: string;
}) {
    return {
        status: params.status,
        at: new Date(),
        by: params.by,
        note: params.note,
    };
}


/**
 * PATCH /orders/:orderId/status
 * body: { status: OrderStatus, note?: string }
 * Restaurant or courier updates status.
 */
export async function updateOrderStatus(req: Request, res: Response) {
    try {
        if (!req.user?.id) return bad(res, 401, "Unauthorized");

        const { orderId } = req.params;
        if (!isObjectId(orderId)) return bad(res, 400, "Invalid orderId");

        const { status, note }: { status: OrderStatus; note?: string } = req.body ?? {}; const allowed: OrderStatus[] = [
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
        ];

        if (!allowed.includes(status)) return bad(res, 400, "Invalid status");

        const userId = req.user.id;
        const by = toObjectId(userId);

        const order = await OrderModel.findById(orderId).populate({
            path: "restaurantId",
            select: "name phone",
        })
            .populate({
                path: "courierId",
                select: "name phone carModel carColor carNumber regionCode",
            });
        if (!order) return bad(res, 404, "Order not found");

        // Access control (adjust to your domain rules)
        const isCourier = order.courierId && String(order.courierId) === userId;
        const isConsumer = String(order.consumerId) === userId;

        // NOTE: restaurant ownership is usually via Restaurant.ownerId
        const isRestaurant = String(order.restaurantId) === userId;

        const role = req.user.role;
        const canUpdate =
            role === "ADMIN" || role === "RESTAURANT_OWNER" ||
            isCourier ||
            isRestaurant ||
            // optionally allow consumer to mark DELIVERED? usually no
            false;

        if (!canUpdate) return bad(res, 403, "Forbidden");

        // Simple transition rules (tighten as you wish)
        const terminal = new Set<OrderStatus>([
            "DELIVERED",
            "CANCELLED_BY_CONSUMER",
            "CANCELLED_BY_RESTAURANT",
            "CANCELLED_NO_COURIER",
        ]);
        if (terminal.has(order.status)) return bad(res, 409, "Order already finished");

        // Consumer cancellation should go via cancel endpoint
        if (status === "CANCELLED_BY_CONSUMER" && !isConsumer && role !== "ADMIN")
            return bad(res, 403, "Only consumer can cancel their order");

        order.status = status;
        order.statusHistory.push(pushHistory({ status, by, note: typeof note === "string" ? note : undefined }));

        const translatedStatus = statusTranslation[status] ?? status;

        if (order.consumerId) {
            FcmService.sendPassengerMessage({
                id: order.consumerId.toString(),
                title: `Buyurtma #${order.orderNumber}: ${translatedStatus}`,
                body: "",
            });
        }
        await order.save();
        return ok(res, order);
    } catch (err: any) {
        return bad(res, 500, err?.message ?? "Server error");
    }
}