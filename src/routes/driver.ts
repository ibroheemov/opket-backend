import express from "express";
import { authenticateDriver } from "../middlewares/auth";
import { driverDashboard, getDriver, getDriverBalance, registerDriver, updateLocation, updateStatus } from "../controllers/driverController";
import { upload } from "../middlewares/upload";
import { registerFcm } from "../controllers/driver/registerFcm";
import { getWeeklyStats } from "../controllers/driver/getWeeklyStats";
import { getProfile } from "../controllers/driver/getProfile";
import authController from "../controllers/ auth.controller";
import { payChange } from "../controllers/driver/payChange";
import { heartbeat } from "../controllers/driver/heartbeat";
import { refreshToken } from "../controllers/driver/refreshToken";
import { fetchFareConfig, fetchWorkingAreas } from "../controllers/fare.controller";
import { acceptRide, declineRide } from "../controllers/ride.controller";
import { getDirections } from "../controllers/driver/getDirections";

const router = express.Router();

router.post("/send-otpr", authController.sendOtp);
router.post("/check-driver", authController.checkDriver);
router.post("/login", authController.login);
router.get("/get-driver", getDriver);
router.get("/fare", fetchFareConfig);
router.get("/:id/profile", getProfile);
router.get("/:id/stats/weekly", getWeeklyStats);
router.post("/refresh-token", refreshToken);
router.post("/heartbeat", authenticateDriver, heartbeat);
router.get("/directions", getDirections);
router.post("/register-fcm", authenticateDriver, registerFcm);
router.post("/update-location", authenticateDriver, updateLocation);
router.post("/status", authenticateDriver, updateStatus);
router.get("/:id/balance", authenticateDriver, getDriverBalance);
router.post("/pay-change", authenticateDriver, payChange);
router.post("/dashboard", driverDashboard);
router.get("/working-areas", authenticateDriver, fetchWorkingAreas);
router.post(
    "/register",
    upload.fields([
        { name: "selfie", maxCount: 1 },
        { name: "driverLicense", maxCount: 1 },
        { name: "passport", maxCount: 1 },
    ]),
    registerDriver
);
router.post("/accept-ride/:id", authenticateDriver, acceptRide);


export default router;
