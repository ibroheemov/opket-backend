// src/infrastructure/mappers/DriverMapper.ts
import { IDriverDocument } from "../../models/DriverModel";
import { Driver } from "../../domain/entites/Driver";

export class DriverMapper {
    static toDomain(doc: IDriverDocument): Driver {
        return {
            id: doc.id,
            name: doc.name,
            phone: doc.phone,
            vehicle: doc.vehicle,
            status: doc.status,
            location: doc.location ?? { lat: 0, lon: 0 },
            otp: doc.otp,
            otpExpiresAt: doc.otpExpiresAt,
            chatId: doc.chatId,
        };
    }
}
