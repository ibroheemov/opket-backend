import express from "express";
import { authenticateDriver } from "../middlewares/auth";
import { driverDashboard, getCarOptions, getDriver, getDriverBalance, getDriverBalanceNew, registerDriver, updateLocation, updateStatus } from "../controllers/driverController";
import { upload } from "../middlewares/upload";
import { registerFcm } from "../controllers/driver/registerFcm";
import { getWeeklyStats, getWeeklyStatsNew } from "../controllers/driver/getWeeklyStats";
import { getProfile, getProfileNew } from "../controllers/driver/getProfile";
import authController from "../controllers/ auth.controller";
import { payChange } from "../controllers/driver/payChange";
import { heartbeat } from "../controllers/driver/heartbeat";
import { refreshToken } from "../controllers/driver/refreshToken";
import { fetchFareConfig, fetchFareConfigNew, fetchWorkingAreas } from "../controllers/fare.controller";
import { acceptRide, completeGhostRide, completeRide, skipRide, toggleRideOption } from "../controllers/ride.controller";
import { getDirections } from "../controllers/driver/getDirections";
import { cancelRideDriver } from "../controllers/userController";
import { deductFromUser, generateQrLink, getMyRides, updateAppVersion } from "../controllers/driver.controller";

const router = express.Router();

router.post("/send-otpr", authController.sendOtp);
router.post("/check-driver", authController.checkDriver);
router.post("/login", authController.login);
router.get("/get-driver", getDriver);
router.get("/fare", authenticateDriver, fetchFareConfig);
router.post("/fare", authenticateDriver, fetchFareConfigNew);
router.get("/profile", authenticateDriver, getProfileNew);
router.get("/:id/profile", getProfile);
router.get("/:id/stats/weekly", getWeeklyStats);
router.get("/stats/weekly", authenticateDriver, getWeeklyStatsNew);
router.post("/refresh-token", refreshToken);
router.post("/heartbeat", authenticateDriver, heartbeat);
router.get("/directions", getDirections);
router.post("/register-fcm", authenticateDriver, registerFcm);
router.post("/update-location", authenticateDriver, updateLocation);
router.post("/status", authenticateDriver, updateStatus);
router.get("/:id/balance", authenticateDriver, getDriverBalance);
router.get("/balance", authenticateDriver, getDriverBalanceNew);
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
router.post("/skip-ride/:id", authenticateDriver, skipRide);
router.get("/generate-qr-link", authenticateDriver, generateQrLink);
router.post("/complete-ride", authenticateDriver, completeRide);
router.post("/complete-ghost-ride", authenticateDriver, completeGhostRide);
router.post("/cancel-ride", authenticateDriver, cancelRideDriver);
router.post("/deduct-from-user", authenticateDriver, deductFromUser);
router.get("/car-options", authenticateDriver, getCarOptions);
router.post("/toggle-ride-option", authenticateDriver, toggleRideOption);
router.post("/app-version", authenticateDriver, updateAppVersion);
router.get("/rides", authenticateDriver, getMyRides);

export default router;
