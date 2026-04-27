import { SettingsModel } from "../models/SettingsModel";

export const getDefaultCommission = async (): Promise<number> => {
    const setting = await SettingsModel.findOne({ key: "commission" });
    return (setting?.value ?? 14) / 100;
};