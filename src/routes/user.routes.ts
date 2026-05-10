import express from "express";
// import { markArrived, startRide, endRide } from "../controllers/rideController";
import { cancelRide, confirmLuggage, createPassengerApp, createPassengerBot, declineLuggage, deleteAccount } from "../controllers/userController";
import { currentRide, requestRide } from "../controllers/ride.controller";
import { getPassenger } from "../controllers/passenger/getPassenger";
import { payfare } from "../controllers/passenger/payFare";
import { getPassengerBalance } from "../controllers/passenger/getPassengerBalance";
import { fetchFareConfigUser } from "../controllers/fare.user.controller";
import { registerPassengerFcm } from "../controllers/general.passenger.controller";
import { verifyPassenger } from "../controllers/passenger/verifyPassenger";
import { updateAppVersionPassenger } from "../controllers/passenger/updateAppVersionPassenger";
import { authenticateDriver } from "../middlewares/auth";
import { getMyRidesPassenger } from "../controllers/passenger.controller";
import { verifyPassengerReferralLocation } from "../controllers/referral.controller";
import { requireAuth } from "../middlewares/requireAuth";

const router = express.Router();

router.get("/verify-passenger/:phone", verifyPassenger);
router.post("/app-version/:phone", updateAppVersionPassenger);
router.get("/:id/get-passenger", getPassenger);
router.get("/:id/balance", getPassengerBalance);
router.post("/:id/pay-fare", payfare);
router.post("/request-ride", authenticateDriver, requestRide);
router.get("/:id/current-ride", currentRide);
router.post("/cancel-ride", cancelRide);
router.post("/confirm-luggage", confirmLuggage);
router.post("/decline-luggage", declineLuggage);
router.post("/create", createPassengerApp);
router.post("/create-bot", createPassengerBot);
router.get("/fare/config", fetchFareConfigUser);
router.post("/delete-account", deleteAccount);
router.post("/:phone/registerFcm", registerPassengerFcm);
router.get("/rides", authenticateDriver, getMyRidesPassenger);
router.post("/referral/verify-location", requireAuth, verifyPassengerReferralLocation);

export default router;
