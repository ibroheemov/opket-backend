import { Router } from "express";
import { listCancelReasons } from "../controllers/cancellationReason.controller";

const router = Router();

router.get("/cancel-reasons", listCancelReasons);

export default router;
