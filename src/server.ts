import express from "express";
import { initSocketServer } from "./gateway/socket2";
import http from "http";
import bodyParser from "body-parser";
import { makeDriverAuthController } from "./controllers/driverAuthController";
import { MongoDriverRepo } from "./infra/repos/MongoDriverRepo";
import { connectDB } from "./utils/db";
import userRoutes from "./routes/user";
import paynetRoutes from "./routes/paynet";
import driverRoutes from "./routes/driver";
import cors from "cors";
import admin from 'firebase-admin';
import { config } from "./bot/config/env";
import { userBot } from "./bot/PassengerBot";
import { PaynetCallbackController } from "./controllers/paynet.controller";

const app = express();
app.use(bodyParser.json());
app.use(cors());

async function startServer() {
    if (!admin.apps.length) {
        const serviceAccount = JSON.parse(config.FIREBASE_ADMIN_SA);

        admin.initializeApp({
            credential: admin.credential.cert({
                ...serviceAccount,
                private_key: serviceAccount.private_key.replace(/\\n/g, '\n')
            }),
        });
    }
    await connectDB();
    const server = http.createServer(app);
    initSocketServer(server);

    const driverRepo = new MongoDriverRepo();

    app.use("/paynet", paynetRoutes);
    app.use("/user", userRoutes);
    app.use("/driver", driverRoutes);
    app.use("/driver", makeDriverAuthController(driverRepo));

    // -------------------------------
    // Telegram webhook route
    if (config.env === "production") {
        app.post(`/bot${config.token}`, (req, res) => {
            userBot.processUpdate(req.body); // forward update to your TelegramBot instance
            res.sendStatus(200);
        });

        // Set webhook if not already set
        (async () => {
            try {
                const webhookInfo = await userBot.getWebHookInfo();
                if (!webhookInfo.url || webhookInfo.url === "") {
                    await userBot.setWebHook(`${config.webhookDomain}/bot${config.token}`);
                    console.log("Webhook set for production");
                } else {
                    console.log("Webhook already set, skipping setWebHook");
                }
            } catch (err) {
                console.error("Error checking/setting webhook:", err);
            }
        })();
    }
    // -------------------------------

    // simple health check
    app.get("/health", (req, res) => res.send("ok"));

    const PORT = config.PORT ?? 3000;
    server.listen(PORT, () => console.log(`listening on ${PORT}`));
}

startServer();