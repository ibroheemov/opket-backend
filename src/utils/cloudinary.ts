// lib/cloudinary.ts
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import { config } from "../bot/config/env";

cloudinary.config({
    cloud_name: config.cloud_name,
    api_key: config.api_key,
    api_secret: config.api_secret,
    secure: true,
});

export default cloudinary;
