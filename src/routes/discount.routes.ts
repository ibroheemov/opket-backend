import { Router } from "express";
import { fetchDiscountConfig } from "../controllers/discount.controller";

const router = Router();

router.get("/config", fetchDiscountConfig);

export default router;
