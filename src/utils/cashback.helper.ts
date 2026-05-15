import { PassengerModel } from "../models/PassengerModel";
import { SettingsModel, SETTINGS_KEYS } from "../models/SettingsModel";

export const handlePassengerCashback = async (
    userPhoneNumber: number | undefined,
): Promise<number> => {
    if (!userPhoneNumber) return 0;
    const setting = await SettingsModel.findOne({ key: SETTINGS_KEYS.CASHBACK });
    const cashback = setting?.value ?? 0;

    if (cashback <= 0) return 0;

    await PassengerModel.findOneAndUpdate(
        { phone: userPhoneNumber },
        { $inc: { balance: cashback } }
    );

    return cashback;
};
