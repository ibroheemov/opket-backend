import express from "express";
import { initSocketServer } from "./gateway/socket2";
import http from "http";
import bodyParser from "body-parser";
import { makeDriverAuthController } from "./controllers/driverAuthController";
import { MongoDriverRepo } from "./infra/repos/MongoDriverRepo";
import { connectDB } from "./utils/db";
import userRoutes from "./routes/user";
import adminRoutes from "./routes/admin";
import paynetRoutes from "./routes/paynet";
import driverRoutes from "./routes/driver.routes";
import restaurantRoutes from "./routes/restaurant.routes";
import foodRoutes from "./routes/food.routes";
import cors from "cors";
import admin from 'firebase-admin';
import { config } from "./bot/config/env";
import { attachHandlers, userBot } from "./bot/PassengerBot";
import { PaynetCallbackController } from "./controllers/paynet.controller";
import { connectRedis } from "./redis/redisClient";
import "./services/rideEvents";
import { startDriverCleanupJob } from "./services/driverCleanup.job";

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
    await connectRedis();
    startDriverCleanupJob();
    const server = http.createServer(app);
    initSocketServer(server);

    const driverRepo = new MongoDriverRepo();

    app.use("/paynet", paynetRoutes);
    app.use("/user", userRoutes);
    app.use("/admin", adminRoutes);
    app.use("/driver", driverRoutes);
    app.use("/restaurant", restaurantRoutes);
    app.use("/food", foodRoutes);
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
                } else {
                }
            } catch (err) {
            }
        })();
    }
    // -------------------------------
    // simple health check
    app.get("/health", (req, res) => res.send("ok"));

    const PORT = config.PORT ?? 3000;
    server.listen(PORT, () => {


        if (config.env === "development") {
            // Clear old updates to avoid phantom triggers
            userBot.getUpdates({ offset: -1 }).then(() => {
                attachHandlers(userBot);
                userBot.startPolling(); // Only in dev
            });
        } else {
            // Production: webhook is set in server.ts
            attachHandlers(userBot);
        }
        console.log(`Listening on PORT: ${config.PORT}`)
    });
}

startServer();

