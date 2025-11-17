import express from "express";
import { authenticateDriver } from "../middlewares/auth";
import { driverDashboard, getDriver, getDriverBalance, registerDriver, updateLocation, updateStatus } from "../controllers/driverController";
import { upload } from "../middlewares/upload";
import { registerFcm } from "../controllers/driver/registerFcm";
import { getWeeklyStats } from "../controllers/driver/getWeeklyStats";
import { getProfile } from "../controllers/driver/getProfile";
import authController from "../controllers/ auth.controller";

const router = express.Router();

router.post("/check-driver", authController.checkDriver);
router.post("/login", authController.login);
router.get("/get-driver", getDriver);
router.get("/:id/profile", getProfile);
router.get("/:id/stats/weekly", getWeeklyStats);
router.post("/register-fcm", authenticateDriver, registerFcm);
router.post("/update-location", authenticateDriver, updateLocation);
router.post("/status", authenticateDriver, updateStatus);
router.get("/:id/balance", authenticateDriver, getDriverBalance);
router.post("/dashboard", driverDashboard);
router.post(
    "/register",
    upload.fields([
        { name: "selfie", maxCount: 1 },
        { name: "driverLicense", maxCount: 1 },
        { name: "passport", maxCount: 1 },
    ]),
    registerDriver
);

export default router;
