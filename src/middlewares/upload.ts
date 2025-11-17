// middlewares/upload.ts
import multer from "multer";

const storage = multer.memoryStorage();
export const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB per file (adjust as needed)
    },
});
