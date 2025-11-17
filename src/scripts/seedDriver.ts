// scripts/seedDriver.ts
import mongoose from "mongoose";
import { DriverModel } from "../models/DriverModel";
import dotenv from "dotenv";

dotenv.config();

async function seed() {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/taxi");

    const testDriver = {
        id: "fner8347y8347r3487rh",
        name: "Shohjahon Ibrohimov",
        phone: "992707255",
        vehicle: "Toyota Prius",
        status: "offline",
    };

    const existing = await DriverModel.findOne({ phone: testDriver.phone });
    if (existing) {
        console.log("✅ Driver already exists:", existing.phone);
        return;
    }

    await DriverModel.create(testDriver);
    console.log("✅ Test driver added:", testDriver);
    await mongoose.disconnect();
}

seed().catch(console.error);
