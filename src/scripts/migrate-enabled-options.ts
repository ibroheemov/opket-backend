import mongoose from "mongoose";
import dotenv from "dotenv";
import { DriverModel } from "../models/DriverModel";

dotenv.config();

async function run() {
    try {
        // Connect to DB
        await mongoose.connect("mongodb+srv://paytube-admin:highsc0re@paytube-cluster.o4c6xhy.mongodb.net/?retryWrites=true&w=majority&appName=Paytube-Cluster", {
            dbName: "paytube",
        });

        console.log("Connected to:", mongoose.connection.host);
        console.log("DB name:", mongoose.connection.name);

        // Models that should receive comfort
        const models = ["Cobalt", "Gentra", "Nexia 3"];

        // Update drivers
        const result = await DriverModel.updateMany(
            {
                carModel: { $in: models },
            },
            {
                $addToSet: { enabledOptions: "comfort" },
            }
        );

        console.log("Matched drivers:", result.matchedCount);
        console.log("Updated drivers:", result.modifiedCount);

        await mongoose.disconnect();
        console.log("Done ✅");
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

run();