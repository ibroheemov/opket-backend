import express from "express";
import { enableServices } from "../controllers/admin.controller";
import { emitToUser } from "../gateway/ride.socket";

const router = express.Router();

router.post("/drivers/enable-services", enableServices);

router.post("/passengers/:phone/force-logout", async (req, res) => {
    const phone = Number(req.params.phone);
    if (!phone || isNaN(phone)) {
        return res.status(400).json({ error: "Invalid phone" });
    }
    await emitToUser(phone, "force_logout", {});
    return res.json({ ok: true });
});

export default router;
