import { DriverModel } from "../../models/DriverModel";
import { DriverMapper } from "../mappers/DriverMapper";
import { Driver } from "../../domain/entites/Driver";

export class MongoDriverRepo {
    async findByPhone(phone: string): Promise<Driver | null> {
        console.log(phone)
        const doc = await DriverModel.findOne({ phone });
        console.log(doc)
        return doc ? DriverMapper.toDomain(doc) : null;
    }

    async findByChatId(chatId: number): Promise<Driver | null> {
        const doc = await DriverModel.findOne({ chatId });
        return doc ? DriverMapper.toDomain(doc) : null;
    }

    async save(driver: Driver): Promise<void> {
        await DriverModel.updateOne({ id: driver.id }, driver, { upsert: true });
    }
}