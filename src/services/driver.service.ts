// import { DriverRepository } from "../repositories/driver.repository";
// import { Driver, DriverLoginRequestBody, DriverRequestBody, UploadMeta } from "../types/driver.types";
// import { generateAccessToken, generateRefreshToken } from "../utils/jwt";
// import { uploadBufferToCloudinary } from "../utils/uploadToCloudinary";

// export const DriverService = {
//     async registerDriver(data: DriverRequestBody) {
//         const { firstname, lastname, phone, password, car_number, car_model, car_color, region_code, driver_license } = data;

//         const existing = await DriverRepository.findByPhone(data.phone);
//         if (existing) throw new Error("Bu telefon raqamli haydovchi ro'yxatdan o'tgan");

//         const fullname = `${firstname} ${lastname}`;
//         const vehicle = `${car_model || "Unknown"} - ${car_number || "N/A"}`;

//         const driverPayload: Partial<Driver> = {
//             firstname,
//             lastname,
//             fullname,
//             phone,
//             password,
//             vehicle,
//             car_number,
//             car_model,
//             car_color,
//             region_code,
//             driver_license: driver_license
//                 ? { status: "PENDING_UPLOAD" }
//                 : { status: "NOT_PROVIDED" },
//         };

//         const newDriver = await DriverRepository.create(driverPayload);

//         // Background upload
//         if (data.driver_license) {
//             void uploadBufferToCloudinary(data.driver_license.buffer, "drivers")
//                 .then(async ({ url, public_id }) => {
//                     const updatedLicense: UploadMeta = { url, publicId: public_id, status: "UPLOADED" };
//                     await DriverRepository.update(newDriver.id, { driver_license: updatedLicense });
//                 })
//                 .catch(async () => {
//                     await DriverRepository.update(newDriver.id, { driver_license: { status: "UPLOAD_FAILED" } });
//                 });
//         }

//         // Tokens
//         const accessToken = generateAccessToken({ id: newDriver.id });
//         const refreshToken = generateRefreshToken({ id: newDriver.id });

//         return { driver: newDriver, accessToken, refreshToken };
//     },

//     async login(data: DriverLoginRequestBody) {
//         const { phone, password, verified } = data;

//         const existing = await DriverRepository.findByPhone(phone);

//         if (!existing) throw new Error("Bu telefon raqam orqali ro'yxatdan o'tgan haydovchi topilmadi");

//         const accessToken = generateAccessToken({ id: existing.id });
//         const refreshToken = generateRefreshToken({ id: existing.id });
//         const response = {
//             accessToken,
//             refreshToken,
//             driver: existing,
//         }

//         if (verified) return response;

//         if (!existing.password) throw new Error("Sizda parol mavjud emas, iltimos sms kod orqali akkauntga kiring");

//         if (existing.password != password) {
//             throw new Error("Parol notog'ri");
//         }

//         return response;
//     }
// };