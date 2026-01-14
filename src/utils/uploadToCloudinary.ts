// lib/uploadToCloudinary.ts
import sharp from "sharp";
import streamifier from "streamifier";
import cloudinary from "./cloudinary";

export const uploadBufferToCloudinary = async (
    buffer: Buffer,
    folder = "drivers"
): Promise<{ url: string; public_id: string }> => {
    // 1️⃣ Optimize image before upload
    const optimizedBuffer = await sharp(buffer)
        .rotate() // auto-fix EXIF orientation
        .resize({
            width: 1600,
            withoutEnlargement: true,
        })
        .jpeg({
            quality: 80,
            mozjpeg: true,
        })
        .toBuffer();

    // 2️⃣ Upload to Cloudinary
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error("Cloudinary upload timed out"));
        }, 20_000);

        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: "image",
            },
            (error, result) => {
                clearTimeout(timeout);

                if (error) return reject(error);
                if (!result?.secure_url || !result.public_id) {
                    return reject(new Error("Invalid Cloudinary response"));
                }

                resolve({
                    url: result.secure_url,
                    public_id: result.public_id,
                });
            }
        );

        uploadStream.on("error", (err) => {
            clearTimeout(timeout);
            reject(err);
        });

        streamifier
            .createReadStream(optimizedBuffer)
            .on("error", (err) => {
                clearTimeout(timeout);
                reject(err);
            })
            .pipe(uploadStream);
    });
};
