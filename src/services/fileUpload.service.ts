// src/services/fileUpload.service.ts
import { uploadBufferToCloudinary } from "../utils/uploadToCloudinary";

class FileUploadService {
    async maybeUpload(fileArr?: Express.Multer.File[]) {
        if (!fileArr || fileArr.length === 0) return undefined;
        const file = fileArr[0];
        return await uploadBufferToCloudinary(file.buffer, "drivers");
    }

    async uploadDriverFiles(files?: { [key: string]: Express.Multer.File[] }) {
        const [selfie, license, passport] = await Promise.all([
            this.maybeUpload(files?.selfie),
            this.maybeUpload(files?.driver_license),
            this.maybeUpload(files?.passport),
        ]);

        return {
            selfieUrl: selfie?.url,
            licenseUrl: license?.url,
            passportUrl: passport?.url,
        };
    }
}

export default new FileUploadService();
