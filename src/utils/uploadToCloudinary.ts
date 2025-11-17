// lib/uploadToCloudinary.ts
import cloudinary from "./cloudinary";
import streamifier from "streamifier";

export const uploadBufferToCloudinary = (buffer: Buffer, folder = "drivers") => {
    return new Promise<{ url: string; public_id: string }>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder }, // you can add transformations here
            (error, result) => {
                if (error) return reject(error);
                if (!result) return reject(new Error("No result from Cloudinary"));
                resolve({ url: result.secure_url, public_id: result.public_id });
            }
        );

        streamifier.createReadStream(buffer).pipe(uploadStream);
    });
};
