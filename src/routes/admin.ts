import express from "express";
import { createWorkingArea, deleteWorkingArea, updateWorkingArea } from "../controllers/working_area.controller";

const router = express.Router();

router.post("/working-areas", createWorkingArea);
router.put("/working-areas/:id", updateWorkingArea);
router.delete("/working-areas/:id", deleteWorkingArea);

export default router;
