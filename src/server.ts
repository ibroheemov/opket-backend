import express from "express";
import { initSocketServer } from "./gateway/socket2";
import http from "http";
import bodyParser from "body-parser";
import { makeDriverAuthController } from "./controllers/driverAuthController";
import { MongoDriverRepo } from "./infra/repos/MongoDriverRepo";
import { connectDB } from "./utils/db";
import dotenv from "dotenv";
import userRoutes from "./routes/user";
import driverRoutes from "./routes/driver";
import cors from "cors";
import admin from 'firebase-admin';

const app = express();
app.use(bodyParser.json());
app.use(cors());

async function startServer() {
    if (!admin.apps.length) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SA!);

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

    app.use("/user", userRoutes);
    app.use("/driver", driverRoutes);
    app.use("/driver", makeDriverAuthController(driverRepo));

    // simple health check
    app.get("/health", (req, res) => res.send("ok"));

    const PORT = process.env.PORT ?? 3000;
    server.listen(PORT, () => console.log(`listening on ${PORT}`));

}

startServer();