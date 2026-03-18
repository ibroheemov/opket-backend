import { Router } from "express";
import { updateOrderStatus } from "../controllers/food.controller";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.post("/orders/:orderId/status", requireAuth, updateOrderStatus);

export default router;