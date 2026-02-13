// src/routes/notify.ts
import express from "express";
import {
    sendToToken,
    sendToTokens,
    sendToTopic,
    type SendToTokenInput,
    type SendToTokensInput,
    type SendToTopicInput,
} from "../services/notifications";

const router = express.Router();

router.post("/token", async (req, res, next) => {
    try {
        const input = req.body as SendToTokenInput;
        const messageId = await sendToToken(input);
        res.json({ ok: true, messageId });
    } catch (e) {
        next(e);
    }
});

router.post("/tokens", async (req, res, next) => {
    try {
        const input = req.body as SendToTokensInput;
        const result = await sendToTokens(input);
        res.json({ ok: true, ...result });
    } catch (e) {
        next(e);
    }
});

router.post("/topic", async (req, res, next) => {
    try {
        const input = req.body as SendToTopicInput;
        const messageId = await sendToTopic(input);
        res.json({ ok: true, messageId });
    } catch (e) {
        next(e);
    }
});

export default router;