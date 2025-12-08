import express from "express";
import { PaynetCallbackController } from "../controllers/paynet.controller";
import { Request, Response } from "express";

const router = express.Router();
const paynetController = new PaynetCallbackController();

router.post("/webhook", async (req: Request, res: Response) => {
    await paynetController.handle(req, res);
});

export default router;
