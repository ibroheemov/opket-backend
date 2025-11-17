import express from "express";
// import { markArrived, startRide, endRide } from "../controllers/rideController";
import { cancelRide } from "../controllers/userController";
import { requestRide } from "../controllers/ride.controller";

const router = express.Router();

router.post("/request-ride", requestRide);
router.post("/cancel-ride", cancelRide);
// router.post("/arrived", authenticate, markArrived);
// router.post("/start", authenticate, startRide);
// router.post("/end", authenticate, endRide);

export default router;
