import mongoose from "mongoose";
import { services } from "../data/fare.database";
import { DriverModel } from "../models/DriverModel";
import dotenv from "dotenv";

function normalizeModel(model?: string) {
    return (model ?? "").trim().toLowerCase();
}

function buildEnabledOptions(driver: { hasPremiumCar?: boolean; carModel?: string }) {
    let ids = services.map(s => s.id);

    // If Matiz -> remove "bagaj"
    if (normalizeModel(driver.carModel) === "matiz") {
        ids = ids.filter(id => id !== "bagaj");
    }

    // If premium car -> add "premium"
    if (driver.hasPremiumCar) {
        ids = [...ids, "premium"];
    }

    // Ensure uniqueness
    return Array.from(new Set(ids));
}

async function run() {
    await mongoose.connect("mongodb+srv://paytube-admin:highsc0re@paytube-cluster.o4c6xhy.mongodb.net/?retryWrites=true&w=majority&appName=Paytube-Cluster", {
        dbName: "paytube", // name of your database
    });
    console.log("Connected to:", mongoose.connection.host);
    console.log("DB name:", mongoose.connection.name);
    console.log("Collection (DriverModel):", DriverModel.collection.name);

    const total = await DriverModel.countDocuments({});
    const missing = await DriverModel.countDocuments({
        $or: [
            { enabledOptions: { $exists: false } },
            { enabledOptions: { $size: 0 } },
            { enabledOptions: null },
        ],
    });

    console.log("Total drivers in this DB/collection:", total);
    console.log("Drivers missing enabledOptions in this DB/collection:", missing);
    // Only update drivers missing enabledOptions (and optionally empty arrays)
    const query = {
        $or: [{ enabledOptions: { $exists: false } }, { enabledOptions: { $size: 0 } }],
    };

    const cursor = DriverModel.find(query)
        .select({ _id: 1, hasPremiumCar: 1, carModel: 1 })
        .lean()
        .cursor();

    const bulkOps: any[] = [];
    let processed = 0;

    for await (const driver of cursor) {
        const enabledOptions = buildEnabledOptions(driver);

        bulkOps.push({
            updateOne: {
                filter: { _id: driver._id },
                update: { $set: { enabledOptions } },
            },
        });

        processed++;

        // Flush in batches
        if (bulkOps.length >= 500) {
            const res = await DriverModel.bulkWrite(bulkOps, { ordered: false });
            console.log("Batch written:", res.modifiedCount);
            bulkOps.length = 0;
        }
    }

    if (bulkOps.length) {
        const res = await DriverModel.bulkWrite(bulkOps, { ordered: false });
        console.log("Final batch written:", res.modifiedCount);
    }

    console.log("Done. Processed drivers:", processed);

    await mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});