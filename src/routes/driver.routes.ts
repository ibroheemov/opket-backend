import express from "express";
import { authenticateDriver } from "../middlewares/auth";
import { driverDashboard, getCarOptions, getDriver, getDriverBalance, getDriverBalanceNew, registerDriver, toggleCarOption, updateLocation, updateStatus, approveDriverDocuments, rejectDriverDocuments, resetDriverDocumentStatus } from "../controllers/driverController";
import { upload } from "../middlewares/upload";
import { registerFcm } from "../controllers/driver/registerFcm";
import { getWeeklyStats, getWeeklyStatsNew } from "../controllers/driver/getWeeklyStats";
import { getProfile, getProfileNew } from "../controllers/driver/getProfile";
import authController from "../controllers/ auth.controller";
import { payChange } from "../controllers/driver/payChange";
import { heartbeat } from "../controllers/driver/heartbeat";
import { refreshToken } from "../controllers/driver/refreshToken";
import { fetchFareConfig, fetchFareConfigNew, fetchWorkingAreas } from "../controllers/fare.controller";
import { acceptRide, completeRide, toggleRideOption } from "../controllers/ride.controller";
import { getDirections } from "../controllers/driver/getDirections";
import { cancelRide, completeGhostRide, createGhostRide, deductFromUser, generateQrLink, getDriverReferralInfo, getDriverStatus, getMyRides, getRideStatus, setStatus, startRide, updateAppVersion } from "../controllers/driver.controller";
import { getRegistrationOptions } from "../controllers/driverController";
import { skipRide } from "../controllers/userController";
import { getDriverReferralRecords, submitDriverReferralLocation } from "../controllers/referral.controller";

const router = express.Router();

router.get("/registration-options", getRegistrationOptions);
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
router.get("/working-areas", fetchWorkingAreas);
router.post(
    "/register",
    upload.fields([
        { name: "licenseFront", maxCount: 1 },
        { name: "licenseBack",  maxCount: 1 },
        { name: "driverPhoto",  maxCount: 1 },
    ]),
    registerDriver
);
router.post("/:id/approve-documents", approveDriverDocuments);
router.post("/:id/reject-documents", rejectDriverDocuments);
router.post("/:id/reset-document-status", resetDriverDocumentStatus);
router.post("/accept-ride/:id", authenticateDriver, acceptRide);
// router.post("/skip-ride/:id", authenticateDriver, skipRide);
router.get("/generate-qr-link", authenticateDriver, generateQrLink);
router.get("/referral", authenticateDriver, getDriverReferralInfo);
router.get("/referral-records", authenticateDriver, getDriverReferralRecords);
router.post("/referral/submit-location", authenticateDriver, submitDriverReferralLocation);
router.post("/complete-ride", authenticateDriver, completeRide);
router.post("/skip-ride", authenticateDriver, skipRide);
router.post("/cancel-ride", authenticateDriver, cancelRide);
router.post("/deduct-from-user", authenticateDriver, deductFromUser);
router.get("/car-options", authenticateDriver, getCarOptions);
router.post("/toggle-car-option", authenticateDriver, toggleCarOption);
router.post("/toggle-ride-option", authenticateDriver, toggleRideOption);
router.post("/app-version", authenticateDriver, updateAppVersion);
router.get("/rides", authenticateDriver, getMyRides);
router.post("/set-status", authenticateDriver, setStatus);
router.get("/status", authenticateDriver, getDriverStatus);
router.get("/ride-status/:id", authenticateDriver, getRideStatus);
// router.post("/complete-ghost-ride", authenticateDriver, completeGhostRide);
router.post("/create-ghost-ride", authenticateDriver, createGhostRide);
router.post("/complete-ghost-ride/:id", authenticateDriver, completeGhostRide);
router.post("/start-ride/:id", authenticateDriver, startRide);

export default router;
