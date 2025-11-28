import express from "express";
// import { markArrived, startRide, endRide } from "../controllers/rideController";
import { cancelRide, confirmLuggage, createPassenger, declineLuggage } from "../controllers/userController";
import { currentRide, requestRide } from "../controllers/ride.controller";
import { getPassenger } from "../controllers/passenger/getPassenger";
import { payfare } from "../controllers/passenger/payFare";

const router = express.Router();

router.post("/:id/get-passenger", getPassenger);
router.post("/:id/pay-fare", payfare);
router.post("/request-ride", requestRide);
router.post("/:id/current-ride", currentRide);
router.post("/cancel-ride", cancelRide);
router.post("/confirm-luggage", confirmLuggage);
router.post("/decline-luggage", declineLuggage);
router.post("/create", createPassenger);

export default router;
